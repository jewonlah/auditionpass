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

    // sweep: 매칭 활성 공고 즉시 게시중지
    let sweep = supabase.from("auditions").update({ is_active: false }).eq("is_active", true);
    if (kind === "email") {
      sweep = sweep.eq("apply_email", value);
    } else if (kind === "domain") {
      sweep = sweep.or(`apply_email.ilike.%@${value},source_url.ilike.%${value}%`);
    } else {
      sweep = sweep.or(`source_name.eq.${value},source_name.ilike.${value}:%`);
    }
    const { data: swept, error: sweepError } = await sweep.select("id");
    const sweptCount = swept?.length ?? 0;

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
      ...(sweepError ? { sweepWarning: `sweep 일부 실패: ${sweepError.message}` } : {}),
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
