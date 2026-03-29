import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: user.id, ...body })
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

  const { data, error } = await supabase
    .from("profiles")
    .update(body)
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
