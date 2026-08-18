import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendApplicationEmail } from "@/lib/email/sendApplicationEmail";
import { getMissingFields } from "@/lib/profile";

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

    // 2. 미니 프로필(지원 최소 요건) 확인 — 이름·출생연도·성별·분야
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const missingFields = getMissingFields(profile);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "지원에 필요한 프로필 정보가 부족합니다.",
          code: "INCOMPLETE_PROFILE",
          missingFields,
        },
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

    // 4. 오디션 정보 조회
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

    // 5. 이메일 발송
    await sendApplicationEmail({ audition, profile });

    // 6. 지원 이력 저장 (status는 F6 상태 모델 — R1은 sent/failed)
    const { error: insertError } = await supabase
      .from("applications")
      .insert({
        user_id: user.id,
        audition_id: auditionId,
        email_sent: true,
        sent_at: new Date().toISOString(),
        status: "sent",
      });

    if (insertError) {
      return NextResponse.json(
        { error: "지원 이력 저장에 실패했습니다." },
        { status: 500 }
      );
    }

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
