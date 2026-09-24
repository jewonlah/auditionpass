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
        status,
        delivery_status,
        send_stopped,
        submission_snapshot,
        profile_version_id,
        sent_at,
        created_at,
        audition_id
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1000);

    if (error) {
      return NextResponse.json(
        { error: "지원 이력 조회에 실패했습니다." },
        { status: 500 }
      );
    }

    const { data: refs, error: refError } = await supabase.rpc("owned_audition_references", { p_ids: (data ?? []).map(a => a.audition_id) });
    if (refError) throw refError;
    const byId = new Map((refs ?? []).map((a: { id: string }) => [a.id, a]));
    return NextResponse.json({ applications: (data ?? []).map(a => ({ ...a, audition: byId.get(a.audition_id) ?? null })) });
  } catch {
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
