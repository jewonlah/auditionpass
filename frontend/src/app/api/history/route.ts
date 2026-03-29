import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    // applications + auditions JOIN
    const { data, error } = await supabase
      .from("applications")
      .select(
        `
        id,
        email_sent,
        sent_at,
        created_at,
        audition:auditions (
          id,
          title,
          company,
          genre,
          deadline,
          is_active
        )
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "지원 이력 조회에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ applications: data ?? [] });
  } catch {
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
