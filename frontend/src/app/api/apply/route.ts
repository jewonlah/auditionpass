import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendApplicationEmail } from "@/lib/email/sendApplicationEmail";

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();

    // 1. 로그인 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { auditionId } = await req.json();

    if (!auditionId) {
      return NextResponse.json(
        { error: "오디션 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 2. 프로필 등록 여부 확인
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "프로필을 먼저 등록해주세요.", code: "NO_PROFILE" },
        { status: 400 }
      );
    }

    // 3. 이미 지원한 오디션인지 확인
    const { data: existingApplication } = await supabase
      .from("applications")
      .select("id")
      .eq("user_id", user.id)
      .eq("audition_id", auditionId)
      .single();

    if (existingApplication) {
      return NextResponse.json(
        { error: "이미 지원한 오디션입니다.", code: "ALREADY_APPLIED" },
        { status: 409 }
      );
    }

    // 4. 지원 가능 횟수 확인 (can_apply_today RPC)
    const { data: canApply } = await supabase.rpc("can_apply_today", {
      p_user_id: user.id,
    });

    if (!canApply) {
      return NextResponse.json(
        {
          error: "오늘 지원 횟수를 모두 사용했습니다.",
          code: "LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    // 5. 오디션 정보 조회
    const { data: audition, error: auditionError } = await supabase
      .from("auditions")
      .select("*")
      .eq("id", auditionId)
      .single();

    if (auditionError || !audition) {
      return NextResponse.json(
        { error: "오디션 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (!audition.apply_email) {
      return NextResponse.json(
        { error: "이 오디션은 이메일 지원이 불가능합니다." },
        { status: 400 }
      );
    }

    // 6. 이메일 발송
    await sendApplicationEmail({ audition, profile });

    // 7. 지원 이력 저장
    const { error: insertError } = await supabase
      .from("applications")
      .insert({
        user_id: user.id,
        audition_id: auditionId,
        email_sent: true,
        sent_at: new Date().toISOString(),
      });

    if (insertError) {
      return NextResponse.json(
        { error: "지원 이력 저장에 실패했습니다." },
        { status: 500 }
      );
    }

    // 8. 일일 지원 횟수 +1 (increment_apply_count RPC)
    await supabase.rpc("increment_apply_count", {
      p_user_id: user.id,
    });

    return NextResponse.json({
      success: true,
      message: "지원이 완료되었습니다.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "지원 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
