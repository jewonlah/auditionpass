import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { REASON_MAP, slaHours } from "@/lib/reports";
import { syncReportsCount } from "@/lib/admin/reportsCount";

// 공고 신고 접수 (36 §4). 로그인 필수 — 중복·장난 신고를 막고 처리 결과를 돌려주기 위함.
// 심각 4종은 접수 즉시 자동 조치: 원클릭 차단 + 검수 강등(pending), 비신뢰 출처면 비활성.

const DAILY_REPORT_LIMIT = 5;

// 자동 강등을 적용해도 되는 상태 — 운영자가 이미 내린 판정(quarantine·rejected)은 덮지 않는다.
// 덮으면 격리 표식이 사라져 검수 큐에 일반 pending으로 되살아나고 BLOCKED 게이트를 우회한다.
const DOWNGRADABLE = ["auto", "approved", "pending"];

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "신고하려면 로그인이 필요합니다.", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      auditionId?: string;
      reason?: string;
      detail?: string;
    };
    const reason = body.reason ? REASON_MAP.get(body.reason) : undefined;
    if (!body.auditionId || !reason) {
      return NextResponse.json({ error: "신고 사유를 선택해 주세요." }, { status: 400 });
    }
    const detail = (body.detail ?? "").trim().slice(0, 1000) || null;

    // 남용 방지: 계정당 24시간 신고 건수 제한.
    // 없으면 계정 1개로 목록의 공고 id를 훑어 사이트 전체를 내릴 수 있다
    // (unique 인덱스는 "같은 공고 재신고"만 막는다).
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", user.id)
      .gte("created_at", since);
    if ((recentCount ?? 0) >= DAILY_REPORT_LIMIT) {
      return NextResponse.json(
        {
          error: `하루에 신고할 수 있는 횟수(${DAILY_REPORT_LIMIT}건)를 넘었습니다. 급한 위험 신고는 고객센터로 알려주세요.`,
          code: "RATE_LIMITED",
        },
        { status: 429 }
      );
    }

    const slaDue = new Date(Date.now() + slaHours(reason.severity) * 3600 * 1000);

    // 본인 명의로 접수 (RLS: reporter_id = auth.uid())
    const { error: insertError } = await supabase.from("reports").insert({
      audition_id: body.auditionId,
      reporter_id: user.id,
      reason: reason.code,
      severity: reason.severity,
      detail,
      sla_due_at: slaDue.toISOString(),
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "이미 신고한 공고입니다. 접수된 신고를 검토 중입니다.", code: "ALREADY_REPORTED" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "신고 접수에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }

    // 신뢰 배지용 유효 신고 수 갱신 + 심각 4종 자동 조치
    // (운영자 검토 전까지 피해 확산을 막는다 — 36 §4)
    let autoAction: string | null = null;
    try {
      const service = createServiceRoleClient();
      await syncReportsCount(service, body.auditionId);

      if (reason.severity === "severe") {
        const { data: audition } = await service
          .from("auditions")
          .select("id, source_name, is_active, review_status")
          .eq("id", body.auditionId)
          .maybeSingle();

        if (audition) {
          const head = (audition.source_name ?? "").split(":")[0].trim();
          const { data: trustedRow } = await service
            .from("trusted_sources")
            .select("source_name")
            .in("source_name", [audition.source_name ?? "", head])
            .limit(1)
            .maybeSingle();
          const trusted = Boolean(trustedRow);

          const update: Record<string, unknown> = { oneclick_blocked: true };
          // 강등은 자동 게재·승인 건에만. 격리·거절 건은 운영자 판정이라 그대로 둔다.
          if (DOWNGRADABLE.includes(audition.review_status)) {
            update.review_status = "pending";
            if (!trusted) update.is_active = false;
          } else {
            update.is_active = false; // 이미 내려간 건은 계속 내려둔다
          }

          const { error: actionError } = await service
            .from("auditions")
            .update(update)
            .eq("id", audition.id);

          if (!actionError) {
            autoAction = trusted
              ? "원클릭 차단 + 검수 강등"
              : "원클릭 차단 + 검수 강등 + 비활성(비신뢰 출처)";
            await service
              .from("reports")
              .update({ auto_action: autoAction })
              .eq("audition_id", body.auditionId)
              .eq("reporter_id", user.id);
          }
        }
      }
    } catch {
      // 자동 조치·집계 실패해도 신고 접수 자체는 유효 — 어드민 큐에서 처리된다
    }

    return NextResponse.json({
      success: true,
      severity: reason.severity,
      autoActioned: Boolean(autoAction),
    });
  } catch {
    return NextResponse.json({ error: "신고 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
