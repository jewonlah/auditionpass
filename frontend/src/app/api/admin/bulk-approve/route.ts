import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { fetchQueueItems } from "@/lib/admin/queue";

// 일괄 액션은 "이 출처의 SAFE 후보 게시 승인"만 (39 §3).
// 서버 강제 조건: 신뢰 출처(티어 A/B 근사 = trusted_sources) + 최근 승인율 90%+(표본 10건 이상,
// admin_actions 기준 — 이력 부족이면 불가) + 대상 전부 SAFE + 건수 직접 입력 일치.
// 원클릭·trust 승격은 일괄에 없음. 신고 급증 조건은 신고 시스템 도입(M2) 시 추가.

export async function POST(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const body = (await req.json()) as { source?: string; expectedCount?: number };
    const source = body.source?.trim();
    if (!source || typeof body.expectedCount !== "number") {
      return NextResponse.json({ error: "source와 expectedCount가 필요합니다." }, { status: 400 });
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
      .select("action, auditions!inner(source_name)")
      .in("action", ["approve", "reject"])
      .eq("auditions.source_name", source)
      .order("created_at", { ascending: false })
      .limit(30);
    if (historyError) {
      return NextResponse.json(
        { error: `승인율 조회 실패 (013 적용 확인): ${historyError.message}` },
        { status: 500 }
      );
    }
    const total = history?.length ?? 0;
    const approves = (history ?? []).filter((h) => h.action === "approve").length;
    if (total < 10) {
      return NextResponse.json(
        { error: `일괄 불가 — 이 출처의 검수 이력이 ${total}건뿐입니다 (10건 이상 필요). 개별 검수로 이력을 쌓으세요.` },
        { status: 403 }
      );
    }
    if (approves / total < 0.9) {
      return NextResponse.json(
        { error: `일괄 불가 — 최근 승인율 ${Math.round((approves / total) * 100)}% (90% 필요).` },
        { status: 403 }
      );
    }

    // 대상: 이 출처의 SAFE 후보 (SAFE 정의가 공개 출처·무충돌·유효 마감·위험 0 포함)
    const items = await fetchQueueItems(supabase, 500);
    const sourceItems = items.filter((it) => it.source_name === source);
    const targets = sourceItems.filter((it) => it.gate.decision === "SAFE");
    const excluded = sourceItems.length - targets.length;

    if (targets.length === 0) {
      return NextResponse.json({ error: "이 출처에 SAFE 후보가 없습니다." }, { status: 409 });
    }
    // 건수 직접 입력 확인 — 불일치면 현재 건수를 돌려주고 재확인
    if (body.expectedCount !== targets.length) {
      return NextResponse.json(
        {
          error: `건수 불일치 — 현재 SAFE 후보는 ${targets.length}건입니다 (제외 ${excluded}건). 다시 확인하세요.`,
          currentCount: targets.length,
          excluded,
        },
        { status: 409 }
      );
    }

    const ids = targets.map((t) => t.id);
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
          prev: { review_status: "pending", is_active: t.is_active },
          next: { review_status: "approved", is_active: true },
          note: `bulk:${source}`,
        }))
    );

    return NextResponse.json({
      success: true,
      approvedCount: updatedIds.size,
      excluded,
      ...(logError ? { logWarning: "액션 로그 기록 실패" } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "일괄 승인 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
