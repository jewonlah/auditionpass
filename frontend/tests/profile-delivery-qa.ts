// One-off internal delivery check. No production audition/application writes.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { ApplicationEmail } from "../src/lib/email/templates/application";
import { renderProfilePdf } from "../src/lib/profile/pdf";
import { ownedPhotoPath } from "../src/lib/profile/photos";
import { buildProfileDocument } from "../src/lib/profile/document";
import { sampleProfile, recipient, runToken } from "./profile-delivery-fixture";
import type { Profile } from "../src/types";

const output = path.resolve("../output/pdf");
const receiptPath = path.join(output, "delivery-receipt.json");
const hash = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const action = process.argv[2] ?? "local";
const normalize = (b: Buffer) => sharp(b, { limitInputPixels: 40_000_000 }).rotate()
  .resize({ width: 1400, height: 1800, fit: "inside", withoutEnlargement: true })
  .flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();

async function main() {
  await mkdir(output, { recursive: true });
  if (action === "local") {
    const evidence = [];
    const photos = await Promise.all(["headshot", "full-length"].map(async (kind) =>
      normalize(await readFile(path.resolve(`../output/imagegen/seo-jian-${kind}.png`)))));
    for (const template_id of ["casting", "career", "portfolio"] as const) {
      const bytes = await renderProfilePdf({ ...sampleProfile, template_id }, photos, "2026-09-22T10:00:00Z");
      assert.ok(bytes.length < 3 * 1024 * 1024);
      await writeFile(path.join(output, `seo-jian-${template_id}.pdf`), bytes);
      const entry = { template: template_id, bytes: bytes.length, sha256: hash(bytes) };
      evidence.push(entry);
      console.log(JSON.stringify(entry));
    }
    await writeFile(path.join(output, "local-pdf-evidence.json"), JSON.stringify(evidence, null, 2));
    return;
  }
  assert.ok(["prepare", "--send", "status"].includes(action), "Unknown action");
  const envFile = parseEnv(await readFile(".env.local", "utf8"));
  // Only these keys are used; environment-based recipient overrides are ignored.
  const supabaseUrl = envFile.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = envFile.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = action === "prepare" ? undefined : envFile.RESEND_API_KEY;
  assert.ok(supabaseUrl && serviceKey, "Required storage configuration missing");
  if (action !== "prepare") assert.ok(resendKey, "Required mail configuration missing");
  if (action === "status") {
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.ok(receipt.providerId, "No provider id; do not resend automatically");
    const result = await new Resend(resendKey).emails.get(receipt.providerId);
    if (result.error) throw Error("Provider status lookup failed");
    const summary = { providerId: result.data?.id, lastEvent: result.data?.last_event, to: result.data?.to };
    await writeFile(path.join(output, "delivery-status.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    return;
  }
  // Refuse every rerun once an attempt has been recorded, including ambiguous failures.
  if (action === "--send") {
    const exists = await access(receiptPath).then(() => true, () => false);
    assert.ok(!exists, "An attempt already exists. Inspect receipt/status; no automatic resend.");
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const current = await db.from("profiles").select("*").eq("name", sampleProfile.name).single();
  assert.ok(!current.error && current.data, "Save the sample via profile UI first");
  const owner = await db.auth.admin.getUserById(current.data.id);
  assert.equal(owner.data.user?.email?.toLowerCase(), recipient, "Unexpected profile owner");
  const version = await db.from("profile_versions").select("id,profile,created_at")
    .eq("user_id", current.data.id).eq("version", current.data.document_version).single();
  assert.ok(!version.error && version.data, "Saved version missing");
  const p = version.data.profile as Profile;
  for (const [key, expected] of Object.entries(sampleProfile)) {
    const actual = p[key as keyof Profile];
    assert.deepEqual(actual === null ? "" : actual, expected === null ? "" : expected, `Saved fixture mismatch: ${key}`);
  }
  assert.ok(Array.isArray(p.photo_urls), "Saved photo_urls must be an array");
  assert.ok(Array.isArray(p.genre) && p.genre.length > 0, "Saved genre must be a nonempty array");
  assert.equal(p.photo_urls.length, 2, "Expected both new sample photos");
  const photoPaths = p.photo_urls.map(url => ownedPhotoPath(url, current.data.id, supabaseUrl));
  const savedPdf = await db.storage.from("profile-documents").download(`${current.data.id}/${version.data.id}.pdf`);
  assert.ok(!savedPdf.error && savedPdf.data, "Open portfolio PDF in the service first");
  const pdf = Buffer.from(await savedPdf.data.arrayBuffer());
  assert.ok(pdf.length > 1000 && pdf.length < 3 * 1024 * 1024);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  await writeFile(path.join(output, "seo-jian-casting-service.pdf"), pdf);
  const evidence = { runToken, profileVersion: current.data.document_version, source: "production-saved-profile-pdf",
    photoCount: photoPaths.length, bytes: pdf.length, sha256: hash(pdf), fixtureMatched: true };
  await writeFile(path.join(output, "service-pdf-evidence.json"), JSON.stringify(evidence, null, 2));
  const signedUrls: string[] = [];
  for (const photoPath of photoPaths) {
    const result = await db.storage.from("profiles").createSignedUrl(photoPath, 7 * 24 * 60 * 60);
    assert.ok(!result.error && result.data?.signedUrl, "Photo signing failed");
    signedUrls.push(result.data.signedUrl);
  }
  const doc = buildProfileDocument(p);
  const q = { ...p, ...doc.profile };
  const html = await render(ApplicationEmail({ templateId: doc.template, auditionTitle: "오디션패스 내부 전달물 확인 (실제 모집 아님)",
    applicantName: q.name, applicantAgeLabel: `${q.birth_year}년생`, applicantGender: q.gender,
    applicantHeight: q.height, applicantWeight: q.weight, applicantBio: q.bio,
    applicantAgency: q.agency, applicantPhone: q.phone, applicantSpecialty: q.specialty ?? [],
    applicantCareer: q.career, applicantTraining: q.training, introductionUrl: q.introduction_url,
    performanceUrl: q.performance_url, audioUrl: q.audio_url, instagramUrl: q.instagram_url,
    youtubeUrl: q.youtube_url, otherUrl: q.other_url, photoUrls: signedUrls }));
  const payload = { from: "오디션패스 <apply@auditionpass.co.kr>", to: recipient, replyTo: recipient,
    subject: `[TEST ${runToken}] [오디션 지원] ${p.name} (${p.gender}/${p.birth_year}년생/${p.genre[0]})`,
    html, attachments: [{ filename: "profile.pdf", content: pdf.toString("base64") }] };
  assert.equal(payload.to, "jewon@turnover.ai.kr");
  assert.ok(!("cc" in payload) && !("bcc" in payload));
  if (action !== "--send") {
    console.log(JSON.stringify({ ...evidence, dryRun: true, to: payload.to, subject: payload.subject, inlinePhotos: signedUrls.length }));
    return;
  }
  const receipt = { state: "attempt-recorded", startedAt: new Date().toISOString(),
    idempotencyKey: `qa-profile-delivery/${runToken}`, payloadHash: hash(JSON.stringify(payload)),
    to: payload.to, subject: payload.subject, pdfSha256: hash(pdf), pdfSource: evidence.source, providerId: null as string | null };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: "wx" });
  const result = await new Resend(resendKey).emails.send(payload, { idempotencyKey: receipt.idempotencyKey });
  if (result.error || !result.data?.id) {
    receipt.state = "provider-not-confirmed";
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
    throw Error("Provider did not confirm sending; inspect status, do not resend.");
  }
  receipt.state = "provider-accepted";
  receipt.providerId = result.data.id;
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "QA operation failed; no automatic retry. Inspect local state."); process.exitCode = 1; });
