import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { dispatchApplication } from "@/lib/apply/dispatch";
import { loadMaterialAttachments } from "@/lib/materials/attachments";
import { getApplicationReadiness } from "@/lib/apply/gate";
import { deliveryMode } from "@/lib/email/sendApplicationEmail";
import { claimFailure } from "@/lib/apply/errors";
import type { DeliveryJob } from "@/lib/apply/delivery";
export const maxDuration = 60;
export async function POST(req: Request) {
  const userDb = await createServerClient();
  const { data: { user } } = await userDb.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = z.object({ preparationId: z.string().uuid(), consent: z.literal(true) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "제출 묶음과 정보 전달 동의를 확인해주세요.", code: "PREPARATION_REQUIRED" }, { status: 400 });
  const db = createServiceRoleClient();
  let reservationAttempted = false;
  try {
    const { data: prep, error } = await db.from("submission_preparations").select("*").eq("id", body.data.preparationId).eq("user_id", user.id).single();
    if (error || !prep || prep.state !== "active" || Date.parse(prep.expires_at) <= Date.now() || prep.mode !== deliveryMode()) return NextResponse.json({ error: "제출 준비가 만료됐어요. 자료를 다시 확인해주세요.", code: "PREPARATION_EXPIRED" }, { status: 409 });
    const { data: profile, error: profileError } = await userDb.from("profiles").select("*").eq("id", user.id).single();
    if (profileError) throw profileError;
    const ready = await getApplicationReadiness(db, prep.audition_id, profile);
    if (ready.issues.length || ready.fingerprint !== prep.fingerprint) return NextResponse.json({ error: ready.issues[0]?.message ?? "접수 조건이 바뀌었어요.", code: "AUDITION_CHANGED" }, { status: 409 });
    let materials: Awaited<ReturnType<typeof loadMaterialAttachments>>;
    try { materials = await loadMaterialAttachments(db, user.id, prep.material_ids); }
    catch { return NextResponse.json(claimFailure("MATERIAL_CHANGED"), { status: 409 }); }
    const hashes = materials.map(m => createHash("sha256").update(Buffer.from(m.content, "base64")).digest("hex"));
    if (JSON.stringify(hashes) !== JSON.stringify(prep.material_hashes)) return NextResponse.json({ error: "첨부 자료가 바뀌었어요. 제출 내용을 다시 확인해주세요.", code: "MATERIAL_CHANGED" }, { status: 409 });
    // Reservation, exact payload and consent become durable together before any external call.
    reservationAttempted = true;
    const { data: job, error: claimError } = await userDb.rpc("claim_submission_preparation", { p_id: prep.id, p_consent: true });
    if (claimError || !job) return NextResponse.json(claimFailure(claimError?.message), { status: 409 });
    const outcome = await dispatchApplication(db, job as DeliveryJob, user.id);
    if (outcome === "expired") return NextResponse.json({ code: "MANUAL_REVIEW", error: "접수 조건이 달라져 발송 확인이 필요합니다. 다시 보내기 전에 support@auditionpass.co.kr로 문의해주세요." }, { status: 409 });
    if (outcome !== "sent") return NextResponse.json({ pending: true, code: "SEND_PENDING", error: "발송 결과를 확인 중입니다. 지원 내역에서 확인해주세요." }, { status: 202 });
    return NextResponse.json({ success: true, message: "발송 요청을 접수했습니다." });
  } catch { return NextResponse.json(reservationAttempted
    ? { code: "SEND_PENDING", error: "지원 처리 결과를 확인하지 못했어요. 다시 보내기 전에 지원 내역을 확인해주세요." }
    : { code: "PREPARATION_UNAVAILABLE", error: "지원 준비를 확인하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 503 }); }
}
