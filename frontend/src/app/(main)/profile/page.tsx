"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ProfileForm } from "@/components/profile/ProfileForm";
import type { Profile } from "@/types";
import { Loader2 } from "lucide-react";
import Link from "next/link";

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
  const isPortfolio = searchParams.get("returnTo") === "/portfolio";
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login?returnTo=%2Fprofile");
      return;
    }

    async function fetchProfile() {
      setLoading(true); setError(false);
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) throw Error();
        const data = await res.json();
        setProfile(data.profile ?? null);
      } catch { setError(true); }
      finally { setLoading(false); }
    }

    fetchProfile();
  }, [user, authLoading, router, retry]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }
  if (error) return <div role="alert" className="py-10 text-center"><p className="text-sm text-gray-600">프로필을 불러오지 못했습니다. 저장된 정보는 변경되지 않았어요.</p><button type="button" onClick={() => setRetry((v) => v + 1)} className="mt-4 min-h-11 rounded-lg bg-primary px-5 text-white">다시 불러오기</button></div>;

  return (
    <div className="pb-4">
      {isPortfolio && <Link href="/portfolio" className="mb-3 inline-flex min-h-11 items-center font-semibold text-primary">포트폴리오로 돌아가기</Link>}
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
            {isPortfolio ? "포트폴리오 편집" : profile ? "프로필 수정" : "프로필 등록"}
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
