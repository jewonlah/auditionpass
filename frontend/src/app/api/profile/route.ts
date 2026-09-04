import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sanitizeProfileBody, validateAgeFields } from "@/lib/profile";

/**
 * 만 14세 미만 차단은 **서버에서** 해야 한다 — 온보딩·프로필 폼은 이 라우트로 직접
 * POST/PUT 하므로 클라이언트 zod 만으로는 우회된다(개인정보 보호법 제22조의2).
 * birth_year 와 deprecated `age` 를 함께 본다 — 상세는 validateAgeFields 주석.
 */
function birthYearGuard(body: unknown): NextResponse | null {
  const err = validateAgeFields(body as { birth_year?: unknown; age?: unknown } | null);
  if (!err) return null;
  return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
}

// GET /api/profile — 내 프로필 조회
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: "프로필 조회 실패" }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

// POST /api/profile — 프로필 생성
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();

  const invalid = birthYearGuard(body);
  if (invalid) return invalid;

  const { data, error } = await supabase
    .from("profiles")
    .insert({ ...sanitizeProfileBody(body), id: user.id })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "이미 프로필이 존재합니다. 수정을 이용해주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "프로필 생성 실패: " + error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data }, { status: 201 });
}

// PUT /api/profile — 프로필 수정
export async function PUT(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();

  const invalid = birthYearGuard(body);
  if (invalid) return invalid;

  const { data, error } = await supabase
    .from("profiles")
    .update(sanitizeProfileBody(body))
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "프로필 수정 실패: " + error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data });
}
