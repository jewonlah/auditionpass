import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url);
    const auditionId = searchParams.get("auditionId");

    // 프로필 존재 여부
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    const hasProfile = !!profile;

    // 이미 지원했는지 확인
    let hasApplied = false;
    if (auditionId) {
      const { data: application } = await supabase
        .from("applications")
        .select("id")
        .eq("user_id", user.id)
        .eq("audition_id", auditionId)
        .single();
      hasApplied = !!application;
    }

    // 오늘 지원 현황 (횟수, 보너스, 남은 횟수 등)
    const { data: applyStatus } = await supabase.rpc(
      "get_daily_apply_status",
      { p_user_id: user.id }
    );

    const status = applyStatus as {
      plan: string;
      count: number;
      ad_bonus: number;
      max_applies: number;
      remaining: number;
      can_apply: boolean;
      can_watch_ad: boolean;
    } | null;

    return NextResponse.json({
      hasProfile,
      hasApplied,
      canApply: status?.can_apply ?? true,
      canWatchAd: status?.can_watch_ad ?? true,
      plan: status?.plan ?? "free",
      todayCount: status?.count ?? 0,
      adBonus: status?.ad_bonus ?? 0,
      maxApplies: status?.max_applies ?? 1,
      remaining: status?.remaining ?? 1,
    });
  } catch {
    return NextResponse.json(
      { error: "확인 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
