"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ProfileForm } from "@/components/profile/ProfileForm";
import type { Profile } from "@/types";
import { Loader2 } from "lucide-react";

export default function ProfilePage() {
  // useSearchParams 는 Suspense 경계 없이는 정적 프리렌더를 깨뜨린다
  return (
    <Suspense fallback={null}>
      <ProfilePageInner />
    </Suspense>
  );
}

function ProfilePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // P3 온보딩 (2026-08-31): 가입 직후 /home 게이트가 여기로 보낸다.
  // 같은 폼이지만 인사가 다르다 — 설정 화면이 아니라 매니저 계약의 첫 장면.
  const isWelcome = searchParams.get("welcome") === "1";
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login?returnTo=%2Fprofile");
      return;
    }

    async function fetchProfile() {
      const res = await fetch("/api/profile");
      const data = await res.json();
      setProfile(data.profile ?? null);
      setLoading(false);
    }

    fetchProfile();
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-4">
      {isWelcome ? (
        <div className="relative mb-6 overflow-hidden rounded-2xl bg-[#141110] px-5 py-6 text-[#F7F4EF]">
          {/* 랜딩과 같은 온도 — 동틀 녘 */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 h-64 w-80"
            style={{
              background:
                "radial-gradient(ellipse at 60% 40%, rgba(255,138,30,0.4), rgba(240,51,15,0.16) 50%, transparent 75%)",
            }}
          />
          <p className="relative text-[11px] font-bold tracking-[0.18em] text-[#FF8A1E]">
            당신의 매니저가 되어 드립니다
          </p>
          <h1 className="relative mt-2 text-[22px] leading-snug font-black tracking-[-0.03em]">
            시작해 볼까요?
            <br />딱 네 가지만 알려주세요
          </h1>
          <p className="relative mt-2.5 text-[13px] leading-relaxed text-[#B8B1A8]">
            이름, 출생연도, 성별, 분야 — 여기까지만 채우면 원클릭 지원이 열립니다.
            소개는 AI가 써 드리고, 나머지는 나중에 채워도 됩니다.
          </p>
        </div>
      ) : (
        <>
          <h1 className="text-lg font-bold mb-1">
            {profile ? "프로필 수정" : "프로필 등록"}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {profile
              ? "정보를 수정하고 저장하세요."
              : "오디션 지원에 사용할 프로필을 등록하세요."}
          </p>
        </>
      )}
      <Suspense fallback={null}>
        <ProfileForm initialData={profile} />
      </Suspense>
    </div>
  );
}
