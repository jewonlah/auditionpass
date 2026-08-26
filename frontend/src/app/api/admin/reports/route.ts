import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";

// 어드민 신고 처리 (39 §1 ③): 조회 + 최소 쓰기(게시중지·격리·유지) + 처리 메모.
// 처리 결과는 유저에게 3상태(접수됨/조치됨/유지됨)로만 노출된다.

type Body = {
  reportId?: number;
  decision?: "unpublish" | "quarantine" | "dismiss" | "note";
  note?: string;
  unblockOneclick?: boolean; // 유지(dismiss) 시 자동 차단 해제 여부
};

export async function GET() {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const supabase = createAdminServiceClient();
    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, audition_id, reason, severity, detail, status, sla_due_at, auto_action, admin_note, handled_by, handled_at, created_at"
      )
      // status 내림차순 = received > dismissed > actioned — 미처리가 항상 앞에 온다
      .order("status", { ascending: false })
      .order("sla_due_at", { ascending: true })
      .limit(100);
    if (error) {
      return NextResponse.json(
        { error: `신고 조회 실패 (015 마이그레이션 적용 확인): ${error.message}`, items: [] },
        { status: 500 }
      );
    }

    const reports = data ?? [];
    const auditionIds = [...new Set(reports.map((r) => r.audition_id))];
    const auditionMap = new Map<string, Record<string, unknown>>();
    const applicantCount = new Map<string, number>();

    if (auditionIds.length > 0) {
      const [{ data: auditions }, { data: applications }] = await Promise.all([
        supabase
          .from("auditions")
          .select("id, title, source_name, source_url, is_active, review_status, oneclick_blocked")
          .in("id", auditionIds),
        // 심각 신고로 내린 공고의 기존 지원자 — 주의 알림 대상 규모 (36 §4)
        supabase.from("applications").select("audition_id").in("audition_id", auditionIds),
      ]);
      for (const a of auditions ?? []) auditionMap.set(a.id, a);
      for (const ap of applications ?? []) {
        applicantCount.set(ap.audition_id, (applicantCount.get(ap.audition_id) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      items: reports.map((r) => ({
        ...r,
        audition: auditionMap.get(r.audition_id) ?? null,
        applicantCount: applicantCount.get(r.audition_id) ?? 0,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "신고 조회 실패";
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const body = (await req.json()) as Body;
    if (!body.reportId || !body.decision) {
      return NextResponse.json({ error: "reportId와 decision이 필요합니다." }, { status: 400 });
    }

    const supabase = createAdminServiceClient();
    const { data: report } = await supabase
      .from("reports")
      .select("id, audition_id, severity, status")
      .eq("id", body.reportId)
      .maybeSingle();
    if (!report) {
      return NextResponse.json({ error: "신고를 찾을 수 없습니다." }, { status: 404 });
    }

    // 메모만 남기는 경우 — 상태는 그대로
    if (body.decision === "note") {
      const { error } = await supabase
        .from("reports")
        .update({ admin_note: body.note ?? null })
        .eq("id", report.id);
      if (error) {
        return NextResponse.json({ error: `메모 저장 실패: ${error.message}` }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const { data: audition } = await supabase
      .from("auditions")
      .select("id, title, review_status, is_active, oneclick_blocked")
      .eq("id", report.audition_id)
      .maybeSingle();

    let actionLabel = "";
    if (body.decision === "unpublish" || body.decision === "quarantine") {
      if (!audition) {
        return NextResponse.json({ error: "공고를 찾을 수 없습니다." }, { status: 404 });
      }
      // 게시중지는 pending 강등(크롤러 재활성화 방지), 격리는 quarantine
      const next =
        body.decision === "quarantine"
          ? { review_status: "quarantine", is_active: false, oneclick_blocked: true }
          : { review_status: "pending", is_active: false, oneclick_blocked: true };
      const { error: updateError } = await supabase
        .from("auditions")
        .update(next)
        .eq("id", audition.id);
      if (updateError) {
        return NextResponse.json({ error: `조치 실패: ${updateError.message}` }, { status: 500 });
      }
      actionLabel = body.decision === "quarantine" ? "격리" : "게시중지";

      await supabase.from("admin_actions").insert({
        actor_email: admin,
        action: body.decision === "quarantine" ? "quarantine" : "unpublish",
        audition_id: audition.id,
        audition_title: audition.title,
        prev: {
          review_status: audition.review_status,
          is_active: audition.is_active,
        },
        next: { review_status: next.review_status, is_active: false },
        note: `신고 #${report.id} 처리`,
      });
    } else {
      // dismiss(유지) — 자동 차단을 풀지 여부는 운영자가 명시적으로 선택
      actionLabel = "유지";
      if (body.unblockOneclick && audition) {
        const { error: unblockError } = await supabase
          .from("auditions")
          .update({ oneclick_blocked: false })
          .eq("id", audition.id);
        if (unblockError) {
          return NextResponse.json(
            { error: `원클릭 차단 해제 실패: ${unblockError.message}` },
            { status: 500 }
          );
        }
        actionLabel = "유지 + 원클릭 차단 해제";
      }
    }

    const { error: statusError } = await supabase
      .from("reports")
      .update({
        status: body.decision === "dismiss" ? "dismissed" : "actioned",
        admin_note: body.note ?? null,
        handled_by: admin,
        handled_at: new Date().toISOString(),
      })
      .eq("id", report.id);
    if (statusError) {
      return NextResponse.json(
        { error: `신고 상태 저장 실패: ${statusError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, actionLabel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "신고 처리 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
