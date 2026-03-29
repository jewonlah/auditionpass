import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST() {
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

    // 현재 ad_bonus 확인
    const today = new Date().toISOString().split("T")[0];
    const { data: dailyCount } = await supabase
      .from("daily_apply_count")
      .select("ad_bonus")
      .eq("user_id", user.id)
      .eq("apply_date", today)
      .single();

    const currentBonus = dailyCount?.ad_bonus ?? 0;

    if (currentBonus >= 3) {
      return NextResponse.json(
        {
          error: "오늘 광고 시청 보너스를 모두 사용했습니다. (최대 3회)",
          code: "AD_BONUS_MAX",
          ad_bonus: currentBonus,
          max_ad_bonus: 3,
        },
        { status: 429 }
      );
    }

    // increment_ad_bonus RPC 호출
    const { data, error } = await supabase.rpc("increment_ad_bonus", {
      p_user_id: user.id,
    });

    if (error) {
      return NextResponse.json(
        { error: "광고 보너스 지급에 실패했습니다." },
        { status: 500 }
      );
    }

    const result = data as {
      ad_bonus: number;
      max_ad_bonus: number;
      can_watch_more: boolean;
    };

    return NextResponse.json({
      success: true,
      message: "추가 지원권 1회가 지급되었습니다!",
      ad_bonus: result.ad_bonus,
      max_ad_bonus: result.max_ad_bonus,
      can_watch_more: result.can_watch_more,
    });
  } catch {
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
