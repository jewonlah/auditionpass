import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { prepareApplicationEmail, deliveryMode } from "@/lib/email/sendApplicationEmail";
import { getMissingFields } from "@/lib/profile";
import { todayKST } from "@/lib/utils";
import { buildReservationRow, decideReservation, applyInProgressResponse, emailSkippedResponse } from "@/lib/apply/status";
import { dispatchApplication } from "@/lib/apply/dispatch";
import type { DeliveryJob } from "@/lib/apply/delivery";
import type { Profile } from "@/types";
import { getOrCreateProfilePdf, type SavedProfile } from "@/lib/profile/pdf-storage";
import type { EmailPayload } from "@/lib/apply/delivery";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const parsed = z.object({ auditionId: z.string().uuid(), expectedProfileVersion: z.number().int().positive().optional() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "공고 정보를 확인해주세요." }, { status: 400 });
    const { auditionId } = parsed.data;
    // Personal data is read with the user's session. Only outcome writes use service_role.
    const [{ data: profile, error: profileError }, { data: audition, error: auditionError }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("auditions").select("*").eq("id", auditionId).maybeSingle(),
    ]);
    if (profileError || auditionError) return NextResponse.json({ error: "지원 정보를 불러오지 못했습니다." }, { status: 503 });
    if (parsed.data.expectedProfileVersion !== undefined && parsed.data.expectedProfileVersion !== profile?.document_version) {
      return NextResponse.json({ error: "프로필이 변경되었습니다. 화면을 새로고침하고 제출 내용을 다시 확인해주세요.", code: "PROFILE_CHANGED" }, { status: 409 });
    }
    const missingFields = getMissingFields(profile);
    if (missingFields.length) return NextResponse.json({ error: "프로필을 먼저 완성해주세요.", code: "INCOMPLETE_PROFILE", missingFields }, { status: 400 });
    if (!audition) return NextResponse.json({ error: "공고를 찾을 수 없습니다." }, { status: 404 });
    if (!audition.is_active || (audition.deadline && audition.deadline < todayKST())) {
      return NextResponse.json({ error: "마감되었거나 게시가 중지된 공고입니다.", code: "NOT_ACTIVE" }, { status: 409 });
    }
    if (audition.oneclick_blocked) return NextResponse.json({ error: "확인 중인 공고로 지원이 잠시 중지되었습니다.", code: "ONECLICK_BLOCKED" }, { status: 409 });
    if (audition.apply_type !== "email" || !audition.apply_email) return NextResponse.json({ error: "원문 사이트에서 지원해주세요." }, { status: 400 });
    const db = createServiceRoleClient();
    const { data: existing, error: readError } = await db.from("applications").select("id,status").eq("user_id", user.id).eq("audition_id", auditionId).maybeSingle();
    if (readError) return NextResponse.json({ error: "지원 기록을 확인하지 못했습니다." }, { status: 503 });
    const reservation = decideReservation(existing);
    if (reservation.action === "reject") return NextResponse.json(reservation.response.body, { status: reservation.response.status });

    // Owner's optional quota: unset/zero remains unlimited.
    const limit = Number(process.env.APPLY_DAILY_LIMIT) || 0;
    if (limit > 0) {
      const { count, error } = await db.from("applications").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).gte("sent_at", todayKST() + "T00:00:00+09:00");
      if (error) return NextResponse.json({ error: "지원 기록 확인에 실패했습니다." }, { status: 503 });
      if ((count ?? 0) >= limit) return NextResponse.json({ error: "오늘의 지원 횟수를 모두 사용했습니다.", code: "DAILY_LIMIT_REACHED" }, { status: 429 });
    }

    // Pin the exact saved revision read above, even if another tab edits the profile now.
    const { data: version, error: versionError } = await supabase.from("profile_versions")
      .select("id,user_id,profile,created_at").eq("user_id", user.id).eq("version", profile.document_version ?? 1).single();
    if (versionError || !version) return NextResponse.json({ error: "저장된 프로필을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.", code: "PROFILE_VERSION_NOT_READY" }, { status: 503 });
    const prepared = await prepareApplicationEmail({ audition, profile: version.profile as Profile, replyToEmail: user.email });
    if ("skipped" in prepared) {
      const response = emailSkippedResponse();
      return NextResponse.json(response.body, { status: response.status });
    }
    let pdf: Buffer;
    try { pdf = await getOrCreateProfilePdf(db, version as SavedProfile, user.id); }
    catch { return NextResponse.json({ error: "첨부할 PDF를 만들지 못했습니다. 저장한 프로필에서 사진과 PDF를 확인해주세요.", code: "PDF_NOT_READY" }, { status: 503 }); }
    const payload: EmailPayload = { ...prepared, attachments: [{ filename: "profile.pdf", content: pdf.toString("base64") }] };
    // Recheck the date after profile rendering/signing, immediately before claiming a send.
    if (audition.deadline && audition.deadline < todayKST()) return NextResponse.json({ error: "마감된 공고입니다.", code: "NOT_ACTIVE" }, { status: 409 });
    const row = { ...buildReservationRow({ userId: user.id, auditionId }), profile_version_id: version.id };
    const claim = reservation.action === "insert"
      ? db.from("applications").insert(row).select("id").single()
      : db.from("applications").update(row).eq("user_id", user.id).eq("audition_id", auditionId).eq("status", "failed").select("id").maybeSingle();
    const { data: application, error: claimError } = await claim;
    if (claimError || !application) {
      if (claimError?.code === "23505" || !claimError) {
        const response = applyInProgressResponse();
        return NextResponse.json(response.body, { status: response.status });
      }
      // Never bypass the claim on missing migration 023; that permits duplicate sends.
      console.error("[apply] reservation failed", { code: claimError.code });
      return NextResponse.json({ error: "지원 기능을 준비 중입니다. 잠시 후 다시 시도해주세요.", code: "SEND_NOT_READY" }, { status: 503 });
    }
    const { data: job, error: jobError } = await db.from("application_delivery_jobs")
      .upsert({ id: crypto.randomUUID(), application_id: application.id, payload, mode: deliveryMode(), provider_id: null, created_at: new Date().toISOString() }, { onConflict: "application_id" })
      .select("*").single();
    if (jobError || !job) {
      // No external send has happened; only this known-safe failure permits a fresh attempt.
      await db.from("applications").update({ status: "failed" }).eq("id", application.id).eq("user_id", user.id);
      console.error("[apply] delivery job unavailable", { code: jobError?.code });
      return NextResponse.json({ error: "발송 준비를 마치지 못했습니다. 잠시 후 다시 시도해주세요.", code: "SEND_NOT_READY" }, { status: 503 });
    }
    const outcome = await dispatchApplication(db, job as DeliveryJob, user.id);
    if (outcome !== "sent") return NextResponse.json({ pending: true, code: "SEND_PENDING", error: "발송 결과를 확인 중입니다. 지원 내역에서 확인해주세요." }, { status: 202 });
    return NextResponse.json({ success: true, message: "발송 요청을 완료했습니다." });
  } catch (error) {
    console.error("[apply] request failed", error);
    return NextResponse.json({ error: "지원 처리에 문제가 발생했습니다. 지원 내역을 먼저 확인해주세요." }, { status: 500 });
  }
}
