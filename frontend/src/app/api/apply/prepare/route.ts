import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getApplicationReadiness } from "@/lib/apply/gate";
import { getOrCreateProfilePdf, type SavedProfile } from "@/lib/profile/pdf-storage";
import { loadMaterialAttachments } from "@/lib/materials/attachments";
import { prepareApplicationEmail, deliveryMode } from "@/lib/email/sendApplicationEmail";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Profile } from "@/types";
import { prepareReviewedSubject, subjectInputSchema } from "@/lib/apply/subject";
import { acknowledgementListSchema, acknowledgementsMatch } from "@/lib/apply/requirements";
export const maxDuration = 60;
const hashBytes = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function POST(req: Request) {
  const userDb = await createServerClient();
  const { data: { user } } = await userDb.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const rate = checkRateLimit(`apply-prepare:${user.id}`, [{ limit: 10, windowMs: 60_000, label: "1분에" }]);
  if (!rate.ok) return NextResponse.json({ error: rate.message }, { status: 429 });
  const parsed = z.object({ auditionId: z.string().uuid(), expectedProfileVersion: z.number().int().positive(), materialIds: z.array(z.string().uuid()).max(3).default([]), acceptedAcknowledgements: acknowledgementListSchema.default([]), ...subjectInputSchema.shape }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "저장한 프로필과 자료를 다시 확인해주세요." }, { status: 400 });
  try {
    const { auditionId, materialIds, expectedProfileVersion } = parsed.data;
    const { data: profile, error: profileError } = await userDb.from("profiles").select("*").eq("id", user.id).single();
    if (profileError || profile.document_version !== expectedProfileVersion) return NextResponse.json({ error: "프로필이 바뀌었어요. 다시 확인해주세요.", code: "PROFILE_CHANGED" }, { status: 409 });
    const db = createServiceRoleClient();
    const { data: version, error: versionError } = await userDb.from("profile_versions").select("id,user_id,profile,created_at,renderer_version").eq("user_id", user.id).eq("version", expectedProfileVersion).single();
    if (versionError || !version) throw new Error("VERSION_UNAVAILABLE");
    const gate = await getApplicationReadiness(db, auditionId, version.profile as Profile);
    if (gate.issues.length || !gate.fingerprint || !gate.subjectRules || !gate.requirements) return NextResponse.json({ error: gate.issues[0]?.message ?? "지원 조건을 다시 확인해주세요.", code: gate.issues[0]?.code ?? "READINESS_UNAVAILABLE" }, { status: 409 });
    if (!acknowledgementsMatch(gate.requirements.acknowledgements, parsed.data.acceptedAcknowledgements)) return NextResponse.json({ error: "공고의 필수 일정을 모두 확인해주세요. 조건이 바뀌었다면 창을 닫고 다시 열어주세요.", code: "ACKNOWLEDGEMENTS_REQUIRED" }, { status: 409 });
    const reviewedSubject = prepareReviewedSubject(gate.subjectRules, version.profile as Profile, parsed.data);
    if (!reviewedSubject.ok) return NextResponse.json({ error: reviewedSubject.error, code: "SUBJECT_INPUT_INVALID" }, { status: 400 });
    const { data: audition, error: auditionError } = await userDb.from("public_auditions").select("id,title,company").eq("id", auditionId).single();
    if (auditionError) throw new Error("AUDITION_UNAVAILABLE");
    const { data: destination, error: destinationError } = await db.rpc("private_application_destination", { p_id: auditionId, p_fingerprint: gate.fingerprint });
    if (destinationError || typeof destination !== "string" || !z.string().email().safeParse(destination).success) throw new Error("DESTINATION_UNAVAILABLE");
    const pdf = await getOrCreateProfilePdf(db, version as SavedProfile, user.id);
    const materials = await loadMaterialAttachments(db, user.id, materialIds);
    const email = await prepareApplicationEmail({ audition: { ...audition, apply_email: destination }, profile: version.profile as Profile, replyToEmail: user.email, reviewedSubject: reviewedSubject.subject });
    if ("skipped" in email) return NextResponse.json({ error: "테스트 수신처가 설정되지 않아 발송 준비를 중지했어요.", code: "EMAIL_SKIPPED" }, { status: 409 });
    const pdfHash = hashBytes(pdf);
    const materialHashes = materials.map(m => hashBytes(Buffer.from(m.content, "base64")));
    const snapshot = { ...reviewedSubject.metadata, requirementsVersion: 1, acceptedAcknowledgements: gate.requirements.acknowledgements, subject: email.subject, fingerprint: gate.fingerprint, auditionId, title: audition.title, company: audition.company, recipient: email.to, replyTo: email.replyTo,
      profileVersionId: version.id, profileVersion: expectedProfileVersion, pdfSha256: pdfHash,
      attachments: ["profile.pdf", ...materials.map(m => m.filename)] };
    const { data: id, error } = await db.rpc("store_submission_preparation", { p_user: user.id, p_data: {
      audition_id: auditionId, profile_version_id: version.id, fingerprint: gate.fingerprint, pdf_sha256: pdfHash,
      material_ids: materialIds, material_hashes: materialHashes, mode: deliveryMode(), snapshot,
      payload: { ...email, attachments: [{ filename: "profile.pdf", content: pdf.toString("base64") }, ...materials] },
    } });
    if (error || typeof id !== "string") throw new Error("PREPARE_FAILED");
    const { fingerprint: _fingerprint, ...publicSnapshot } = snapshot;
    void _fingerprint;
    return NextResponse.json({ preparationId: id, ...publicSnapshot, subject: email.subject, expiresIn: 3600 });
  } catch { return NextResponse.json({ error: "제출 자료를 준비하지 못했어요. 저장본과 추가 자료를 다시 확인해주세요." }, { status: 503 }); }
}
