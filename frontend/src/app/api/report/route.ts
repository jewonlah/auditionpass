import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { REASON_MAP, slaHours } from "@/lib/reports";

// 공고 신고 접수 (36 §4). 로그인 필수 — 중복·장난 신고를 막고 처리 결과를 돌려주기 위함.
// 심각 4종은 접수 즉시 자동 조치: 원클릭 차단 + 검수 강등(pending), 비신뢰 출처면 비활성.

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

    // 심각 4종 자동 조치 — 운영자 검토(24h) 전까지 피해 확산을 막는다
    let autoAction: string | null = null;
    if (reason.severity === "severe") {
      try {
        const service = createServiceRoleClient();
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

          const update: Record<string, unknown> = {
            oneclick_blocked: true,
            review_status: "pending", // 강등 — 검수 큐로 되돌린다
          };
          if (!trusted) update.is_active = false;

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
      } catch {
        // 자동 조치 실패해도 신고 접수 자체는 유효 — 어드민 큐에서 처리된다
      }
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
