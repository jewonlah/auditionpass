import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getMissingFields } from "@/lib/profile";
import type { Profile } from "@/types";

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    let hasApplied = false;
    if (auditionId) {
      const { data: application } = await supabase
        .from("applications")
        .select("id")
        .eq("user_id", user.id)
        .eq("audition_id", auditionId)
        .maybeSingle();
      hasApplied = !!application;
    }

    const typedProfile = (profile as Profile | null) ?? null;
    const missingFields = getMissingFields(typedProfile);

    return NextResponse.json({
      hasApplied,
      missingFields,
      // 시트 ⓒ 확인 화면용 프로필 요약 (발송 메일 스냅샷)
      profileSummary: typedProfile
        ? {
            name: typedProfile.name,
            birthYear: typedProfile.birth_year,
            age: typedProfile.age,
            gender: typedProfile.gender,
            genre: typedProfile.genre ?? [],
            photoCount: typedProfile.photo_urls?.length ?? 0,
            agency: typedProfile.agency,
          }
        : null,
    });
  } catch {
    return NextResponse.json(
      { error: "확인 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
