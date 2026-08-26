import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { fetchQueueItems } from "@/lib/admin/queue";

// 일괄 액션은 "이 출처의 SAFE 후보 게시 승인"만 (39 §3).
// 서버 강제 조건: 신뢰 출처(티어 A/B 근사 = trusted_sources) + 최근 승인율 90%+(표본 10건 이상,
// admin_actions 기준 — 이력 부족이면 불가) + 14일 내 신고 급증 없음 + 대상 전부 SAFE +
// 건수 직접 입력 일치. 원클릭·trust 승격은 일괄에 없음.

// 14일 내 신고 급증 판정: 심각 신고 1건 또는 유효 신고 3건 이상이면 일괄 금지.
// (36 §5 소스 강등 기준 "30일 내 유효 신고 3건"보다 보수적 — 일괄은 개별 검수보다 위험하므로)
const REPORT_SPIKE_DAYS = 14;
const REPORT_SPIKE_TOTAL = 3;

export async function POST(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const body = (await req.json()) as {
      source?: string;
      expectedCount?: number;
      ids?: string[];
    };
    const source = body.source?.trim();
    // ids = 운영자가 화면에서 실제로 본 SAFE 후보. 서버는 이 목록 밖의 건을 절대 승인하지 않는다.
    // (서버가 더 넓은 창에서 재계산하면 운영자가 본 적 없는 건까지 승인되어 "건수 확인"이 무의미해진다)
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : null;
    if (!source || typeof body.expectedCount !== "number" || !ids) {
      return NextResponse.json(
        { error: "source·expectedCount·ids가 필요합니다." },
        { status: 400 }
      );
    }
    if (ids.length !== body.expectedCount) {
      return NextResponse.json(
        { error: "화면 목록과 입력 건수가 일치하지 않습니다. 새로고침 후 다시 시도하세요." },
        { status: 409 }
      );
    }

    const supabase = createAdminServiceClient();

    // 조건 1: 신뢰 출처
    const head = source.split(":")[0].trim();
    const { data: trustedRow } = await supabase
      .from("trusted_sources")
      .select("source_name")
      .in("source_name", [source, head])
      .limit(1)
      .maybeSingle();
    if (!trustedRow) {
      return NextResponse.json(
        { error: "일괄 불가 — 신뢰 출처(trusted_sources)가 아닙니다." },
        { status: 403 }
      );
    }

    // 조건 2: 최근 30건 승인율 90%+ (표본 10건 미만이면 이력 부족으로 불가)
    const { data: history, error: historyError } = await supabase
      .from("admin_actions")
      .select("action, note, auditions!inner(source_name)")
      .in("action", ["approve", "reject"])
      .eq("auditions.source_name", source)
      .order("created_at", { ascending: false })
      .limit(200);
    if (historyError) {
      return NextResponse.json(
        { error: `승인율 조회 실패 (013 적용 확인): ${historyError.message}` },
        { status: 500 }
      );
    }
    // 일괄 승인 이력은 제외 — 포함하면 첫 일괄이 최근 창을 전부 approve로 채워
    // 승인율이 영구 100%로 고정되는 자기 인증이 된다.
    const manual = (history ?? [])
      .filter((h) => !(h.note ?? "").startsWith("bulk:"))
      .slice(0, 30);
    const total = manual.length;
    const approves = manual.filter((h) => h.action === "approve").length;
    if (total < 10) {
      return NextResponse.json(
        { error: `일괄 불가 — 이 출처의 개별 검수 이력이 ${total}건뿐입니다 (10건 이상 필요). 개별 검수로 이력을 쌓으세요.` },
        { status: 403 }
      );
    }
    if (approves / total < 0.9) {
      return NextResponse.json(
        { error: `일괄 불가 — 최근 승인율 ${Math.round((approves / total) * 100)}% (90% 필요).` },
        { status: 403 }
      );
    }

    // 조건 3: 14일 내 신고 급증 없음 (39 §3)
    const spikeSince = new Date(
      Date.now() - REPORT_SPIKE_DAYS * 86400000
    ).toISOString();
    const { data: recentReports, error: reportError } = await supabase
      .from("reports")
      .select("severity, auditions!inner(source_name)")
      .eq("auditions.source_name", source)
      .neq("status", "dismissed")
      .gte("created_at", spikeSince);
    if (reportError) {
      // 신고 테이블을 확인할 수 없으면 일괄을 열어주지 않는다 (안전 방향)
      return NextResponse.json(
        { error: `신고 이력 조회 실패 (015 적용 확인): ${reportError.message}` },
        { status: 500 }
      );
    }
    const severeReports = (recentReports ?? []).filter((r) => r.severity === "severe").length;
    if (severeReports > 0 || (recentReports?.length ?? 0) >= REPORT_SPIKE_TOTAL) {
      return NextResponse.json(
        {
          error:
            `일괄 불가 — 최근 ${REPORT_SPIKE_DAYS}일 내 이 출처 신고 ${recentReports?.length ?? 0}건` +
            (severeReports > 0 ? ` (심각 ${severeReports}건)` : "") +
            ". 개별 검수로 처리하세요.",
        },
        { status: 403 }
      );
    }

    // 대상 = (운영자가 화면에서 본 ids) ∩ (지금도 이 출처의 SAFE 후보).
    // 교집합이라 서버가 더 넓게 조회해도 목록 밖 공고는 승인되지 않는다.
    const items = await fetchQueueItems(supabase, 500);
    const safeById = new Map(
      items
        .filter((it) => it.source_name === source && it.gate.decision === "SAFE")
        .map((it) => [it.id, it])
    );
    const targets = ids.map((id) => safeById.get(id)).filter((it) => it !== undefined);
    const stale = ids.length - targets.length;

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "승인 대상이 없습니다. 목록이 오래되었을 수 있으니 새로고침 후 다시 시도하세요." },
        { status: 409 }
      );
    }
    // 화면에 있던 건이 그사이 SAFE가 아니게 됐다면 전량 중단 — 부분 승인은 하지 않는다
    if (stale > 0) {
      return NextResponse.json(
        {
          error: `목록이 변경되었습니다 — ${stale}건이 더 이상 SAFE가 아닙니다. 새로고침 후 다시 확인하세요.`,
        },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("auditions")
      .update({ review_status: "approved", is_active: true })
      .in("id", ids)
      .eq("review_status", "pending")
      .select("id");
    if (updateError) {
      return NextResponse.json({ error: `일괄 승인 실패: ${updateError.message}` }, { status: 500 });
    }
    const updatedIds = new Set((updated ?? []).map((u) => u.id));

    // 건별 로그 (건별 undo 가능)
    const { error: logError } = await supabase.from("admin_actions").insert(
      targets
        .filter((t) => updatedIds.has(t.id))
        .map((t) => ({
          actor_email: admin,
          action: "approve",
          audition_id: t.id,
          audition_title: t.title,
          prev: {
            review_status: "pending",
            is_active: t.is_active,
            oneclick_blocked: t.oneclick_blocked ?? false,
          },
          next: { review_status: "approved", is_active: true },
          note: `bulk:${source}`,
        }))
    );

    return NextResponse.json({
      success: true,
      approvedCount: updatedIds.size,
      ...(logError ? { logWarning: "액션 로그 기록 실패" } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "일괄 승인 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
