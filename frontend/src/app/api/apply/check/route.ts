import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getMissingFields } from "@/lib/profile";
import { getApplicationReadiness } from "@/lib/apply/gate";
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    let hasApplied = false;
    let isSending = false;
    let isStopped = false;
    if (auditionId) {
      // 발송 실패(status:'failed') 이력은 "지원함"이 아니다 — 재시도 버튼이 계속 눌려야 한다.
      const { data: application, error: applicationError } = await supabase
        .from("applications")
        .select("id, status, send_stopped")
        .eq("user_id", user.id)
        .eq("audition_id", auditionId)
        .maybeSingle();
      if (applicationError) throw applicationError;
      hasApplied = application?.status === "sent" || application?.status === "replied";
      isSending = application?.status === "sending";
      isStopped = application?.send_stopped === true;
    }

    const typedProfile = (profile as Profile | null) ?? null;
    const missingFields = getMissingFields(typedProfile);
    let profileVersionId: string | null = null;
    if (typedProfile?.document_version) {
      const { data: version, error: versionError } = await supabase.from("profile_versions").select("id")
        .eq("user_id", user.id).eq("version", typedProfile.document_version).single();
      if (versionError) throw versionError;
      profileVersionId = version.id;
    }

    const readiness = auditionId ? await getApplicationReadiness(createServiceRoleClient(), auditionId, typedProfile) : null;
    return NextResponse.json({
      readiness: readiness ? { issues: readiness.issues, subjectRules: readiness.subjectRules } : null,
      hasApplied,
      isSending,
      isStopped,
      missingFields,
      // 시트 ⓒ 확인 화면용 프로필 요약 (발송 메일 스냅샷)
      profileSummary: typedProfile
        ? {
            name: typedProfile.name,
            documentVersion: typedProfile.document_version ?? null,
            profileVersionId,
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
