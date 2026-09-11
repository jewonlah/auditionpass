import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { dispatchApplication } from "@/lib/apply/dispatch";
import type { DeliveryJob } from "@/lib/apply/delivery";
import { todayKST } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const parsed = z.object({ applicationId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "지원 기록을 확인해주세요." }, { status: 400 });
    const { data: application, error } = await supabase.from("applications").select("id,status,created_at,audition_id")
      .eq("id", parsed.data.applicationId).eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: "지원 기록 조회에 실패했습니다." }, { status: 503 });
    if (!application) return NextResponse.json({ error: "지원 기록을 찾을 수 없습니다." }, { status: 404 });
    if (application.status !== "sending") return NextResponse.json({ success: application.status === "sent", refresh: true });
    // Fetch server-only snapshots only after ownership has been proven.
    const db = createServiceRoleClient();
    const { data: job, error: jobError } = await db.from("application_delivery_jobs").select("*").eq("application_id", application.id).maybeSingle();
    if (jobError) return NextResponse.json({ error: "발송 기록 조회에 실패했습니다." }, { status: 503 });
    if (!job) return NextResponse.json({ error: "이전 발송 기록을 확인해야 합니다. support@auditionpass.co.kr로 문의해주세요.", code: "MANUAL_REVIEW" }, { status: 409 });
    if (!job.provider_id) {
      const { data: audition, error: auditionError } = await supabase.from("auditions").select("is_active,deadline,oneclick_blocked")
        .eq("id", application.audition_id).maybeSingle();
      if (auditionError) return NextResponse.json({ error: "공고 상태를 확인하지 못했습니다." }, { status: 503 });
      if (!audition || !audition.is_active || audition.oneclick_blocked || (audition.deadline && audition.deadline < todayKST())) {
        return NextResponse.json({ error: "현재 지원이 종료된 공고입니다. 이전 발송 결과는 support@auditionpass.co.kr로 문의해주세요.", code: "MANUAL_REVIEW" }, { status: 409 });
      }
    }
    if (!job.provider_id && Date.now() - Date.parse(job.created_at) < 300_000) {
      return NextResponse.json({ error: "아직 발송을 처리하고 있습니다. 5분 후 다시 확인해주세요." }, { status: 409 });
    }
    const result = await dispatchApplication(db, job as DeliveryJob, user.id);
    if (result === "expired") return NextResponse.json({ error: "중복 발송 방지를 위해 담당자 확인이 필요합니다. support@auditionpass.co.kr로 문의해주세요.", code: "MANUAL_REVIEW" }, { status: 409 });
    if (result === "pending") return NextResponse.json({ pending: true, error: "발송 결과 확인이 지연되고 있습니다. 잠시 후 다시 확인해주세요." }, { status: 202 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "발송 결과를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
  }
}
