import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";

// suppression 긴급 차단 (R1b, 39 §1 ④ · 36 §4)
// POST: 차단 등록 + 매칭 활성 공고 즉시 게시중지(sweep) + 액션 로그.
// sweep은 undo API로 되돌릴 수 없다 — 해제는 차단 삭제 후 수동 재게시 (긴급 차단은 안전 방향 고정).

const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com", "naver.com", "daum.net", "hanmail.net", "kakao.com",
  "nate.com", "outlook.com", "hotmail.com", "icloud.com", "yahoo.com",
]);

export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const supabase = createAdminServiceClient();
  const { data, error } = await supabase
    .from("suppression")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: `조회 실패 (014 마이그레이션 적용 확인): ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const body = (await req.json()) as { kind?: string; value?: string; reason?: string };
    const kind = body.kind;
    const rawValue = (body.value ?? "").trim();
    // 이메일·도메인만 소문자 정규화 — 소스명은 대소문자 그대로 매칭 (예: "OTR")
    const value = kind === "source" ? rawValue : rawValue.toLowerCase();
    const reason = (body.reason ?? "").trim();

    if (!kind || !["email", "domain", "source"].includes(kind)) {
      return NextResponse.json({ error: "kind는 email/domain/source 중 하나입니다." }, { status: 400 });
    }
    if (!value || value.includes(",")) {
      return NextResponse.json({ error: "차단 값이 비었거나 쉼표를 포함합니다." }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "차단 사유는 필수입니다." }, { status: 400 });
    }
    if (kind === "domain" && PUBLIC_MAIL_DOMAINS.has(value)) {
      return NextResponse.json(
        { error: `공용 메일 도메인(${value})은 차단할 수 없습니다 (36 §4). 이메일 단위로 차단하세요.` },
        { status: 400 }
      );
    }
    if (kind === "email" && !value.includes("@")) {
      return NextResponse.json({ error: "이메일 형식이 아닙니다." }, { status: 400 });
    }

    const supabase = createAdminServiceClient();
    const { error: insertError } = await supabase
      .from("suppression")
      .insert({ kind, value, reason, created_by: admin });
    if (insertError) {
      const dup = insertError.code === "23505";
      return NextResponse.json(
        { error: dup ? "이미 차단된 값입니다." : `등록 실패: ${insertError.message}` },
        { status: dup ? 409 : 500 }
      );
    }

    // sweep: 매칭 활성 공고 즉시 게시중지 + 대리 발송 차단.
    // is_active만 내리면 이미 열어둔 상세 페이지에서 지원이 나갈 수 있어 둘 다 건다.
    // 필터를 or()에 몰지 않고 조건별로 나눠 실행한다. or() 안에서는 한글·공백·콜론이 섞인
    // 출처명이 안전하게 파싱된다고 보장하기 어렵고, PostgREST 와일드카드는 '*'다.
    const swept = new Set<string>();
    const sweepErrors: string[] = [];

    const runSweep = async (
      apply: (
        q: ReturnType<typeof supabase.from>
      ) => ReturnType<ReturnType<typeof supabase.from>["update"]>
    ) => {
      const { data, error } = await apply(supabase.from("auditions")).select("id");
      if (error) sweepErrors.push(error.message);
      for (const r of (data ?? []) as { id: string }[]) swept.add(r.id);
    };

    const patch = { is_active: false, oneclick_blocked: true };
    if (kind === "email") {
      // 저장된 주소에 대문자가 섞여 있어도 잡아야 한다 (게이트·크롤러는 소문자로 비교)
      await runSweep((q) => q.update(patch).eq("is_active", true).ilike("apply_email", value));
    } else if (kind === "domain") {
      await runSweep((q) =>
        q.update(patch).eq("is_active", true).ilike("apply_email", `*@${value}`)
      );
      await runSweep((q) =>
        q.update(patch).eq("is_active", true).ilike("source_url", `*${value}*`)
      );
    } else {
      // 정확 일치와 하위 출처('네이버카페:빛이 모이는 곳')를 모두 내린다.
      // 하위 출처를 빼면 긴급 차단이 사실상 아무것도 못 내리는 경우가 생긴다.
      await runSweep((q) => q.update(patch).eq("is_active", true).eq("source_name", value));
      await runSweep((q) =>
        q.update(patch).eq("is_active", true).ilike("source_name", `${value}:*`)
      );
    }
    const sweptCount = swept.size;

    await supabase.from("admin_actions").insert({
      actor_email: admin,
      action: "unpublish",
      audition_id: null,
      audition_title: `[suppression sweep] ${kind}:${value}`,
      prev: null,
      next: { is_active: false },
      note: `suppression ${kind}:${value} — 활성 ${sweptCount}건 게시중지 · 사유: ${reason}`,
    });

    return NextResponse.json({
      success: true,
      sweptCount,
      ...(sweepErrors.length > 0
        ? { sweepWarning: `sweep 일부 실패: ${sweepErrors.join(" / ")}` }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "차단 등록 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const { id } = (await req.json()) as { id?: number };
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

    const supabase = createAdminServiceClient();
    const { error } = await supabase.from("suppression").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: `해제 실패: ${error.message}` }, { status: 500 });
    }
    // 해제해도 내려간 공고는 자동 재게시하지 않는다 (수동 재검토)
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "해제 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
