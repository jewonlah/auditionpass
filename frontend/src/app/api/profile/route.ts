import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sanitizeProfileBody, validateAgeFields } from "@/lib/profile";
import { profileWriteSchema } from "@/lib/profile/form";
import { profilePhotoWriteError } from "@/lib/profile/photo-write";

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

  const { data: available } = await supabase.rpc("available_profile_templates");
    return NextResponse.json({ availableTemplates: (available ?? []).map((t: { template_id: string }) => t.template_id), profile: data });
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

  const body = await request.json().catch(() => null);

  const invalid = birthYearGuard(body);
  if (invalid) return invalid;

  const parsed = profileWriteSchema.safeParse(sanitizeProfileBody(body));
  if (!body || !parsed.success) return NextResponse.json({ error: "프로필 입력값을 확인해주세요.", code: "INVALID_PROFILE" }, { status: 400 });
  const photoError = profilePhotoWriteError(parsed.data, user.id, process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (photoError) return NextResponse.json(photoError, { status: 400 });
  if (!parsed.data.name || !parsed.data.gender || !parsed.data.genre?.length || !(parsed.data.birth_year || parsed.data.age)) {
    return NextResponse.json({ error: "이름·출생연도·성별·지원 분야를 입력해주세요.", code: "INCOMPLETE_PROFILE" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("save_profile_document", { p_fields: parsed.data, p_create: true });

  if (error) {
    if (error.message?.includes("TEMPLATE_NOT_READY")) return NextResponse.json({ error: "이 서식은 준비 중이에요. 다른 서식을 선택해주세요.", code: "TEMPLATE_NOT_READY" }, { status: 409 });
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "이미 프로필이 존재합니다. 수정을 이용해주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "프로필을 저장하지 못했습니다. 잠시 후 다시 시도해주세요." },
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

  const body = await request.json().catch(() => null);

  const invalid = birthYearGuard(body);
  if (invalid) return invalid;

  const parsed = profileWriteSchema.safeParse(sanitizeProfileBody(body));
  if (!body || !parsed.success) return NextResponse.json({ error: "프로필 입력값을 확인해주세요.", code: "INVALID_PROFILE" }, { status: 400 });

  const photoError = profilePhotoWriteError(parsed.data, user.id, process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (photoError) return NextResponse.json(photoError, { status: 400 });

  const { data, error } = await supabase.rpc("save_profile_document", { p_fields: parsed.data, p_create: false });

  if (error) {
    if (error.message.includes("TEMPLATE_NOT_READY")) return NextResponse.json({ error: "아직 사용할 수 없는 디자인이에요. 사용 가능한 디자인을 선택해주세요.", code: "TEMPLATE_NOT_READY" }, { status: 409 });
    return NextResponse.json(
      { error: "프로필을 수정하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data });
}
