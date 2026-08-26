import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { fetchSourceHealth } from "@/lib/admin/sourceHealth";

// 출처 신뢰 해제(강등) — 36 §5 소스 중단 기준.
// trusted_sources에서 제거하면 이후 신규 공고가 자동 게재 대신 pending으로 들어간다.
// 이미 게재된 공고는 건드리지 않는다(내리려면 게시중지·suppression을 쓸 것).
//
// 승격(trust 부여)은 여기 없다 — 39 §3이 완전 별도 절차(30일·표본 30건·운영자 사유)로 규정.

export async function DELETE(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const body = (await req.json()) as { source?: string; reason?: string };
    const source = body.source?.trim();
    const reason = (body.reason ?? "").trim();
    if (!source) {
      return NextResponse.json({ error: "source가 필요합니다." }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "강등 사유는 필수입니다." }, { status: 400 });
    }

    const supabase = createAdminServiceClient();

    // 접두 표기("네이버카페: xx")로 등록된 하위 출처까지 함께 해제
    const { data: removed, error } = await supabase
      .from("trusted_sources")
      .delete()
      .or(`source_name.eq.${source},source_name.like.${source}:%`)
      .select("source_name");
    if (error) {
      return NextResponse.json({ error: `강등 실패: ${error.message}` }, { status: 500 });
    }
    if (!removed || removed.length === 0) {
      return NextResponse.json(
        { error: "이미 신뢰 출처가 아닙니다." },
        { status: 409 }
      );
    }

    // 판정 근거를 함께 기록해 나중에 왜 내렸는지 추적 가능하게 한다
    const health = await fetchSourceHealth(supabase);
    const evidence = health?.get(source)?.reasons.join(", ") ?? "집계 없음";

    await supabase.from("admin_actions").insert({
      actor_email: admin,
      action: "unpublish",
      audition_id: null,
      audition_title: `[출처 강등] ${source}`,
      prev: { trusted: true },
      next: { trusted: false },
      note: `${removed.length}건 해제 · 사유: ${reason} · 근거: ${evidence}`,
    });

    return NextResponse.json({ success: true, removed: removed.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "강등 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
