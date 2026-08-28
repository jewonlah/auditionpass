"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { ApplyButton } from "@/components/audition/ApplyButton";
import { ReportButton } from "@/components/audition/ReportButton";
import { useAuth } from "@/hooks/useAuth";
import type { Audition } from "@/types";

/**
 * 공고 상세의 인터랙티브 부분만 담는 클라이언트 아일랜드 (2026-08-28 분리).
 *
 * 그전에는 페이지 전체가 "use client" 라 본문이 클라이언트에서만 그려졌다.
 * 실측: GPTBot 으로 받은 HTML 의 본문 텍스트가 59자(네비게이션뿐)였고 h1 도 0개였다.
 * 구글은 JS 를 실행하지만 GPTBot·ClaudeBot·PerplexityBot 은 실행하지 않아
 * 공고 4,400여 건이 AI 검색에 통째로 안 보이는 상태였다.
 *
 * 로그인 상태가 필요한 것(지원·신고)과 히스토리 조작(뒤로가기)만 여기 남기고,
 * 제목·본문·메타 등 색인 대상은 전부 서버에서 렌더한다.
 */

export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4 -ml-1 transition-colors"
    >
      <ArrowLeft size={18} />
      <span>뒤로가기</span>
    </button>
  );
}

export function AuditionActions({
  audition,
  isExpired,
}: {
  audition: Audition;
  isExpired: boolean;
}) {
  const { user, loading: authLoading } = useAuth();

  return (
    <>
      <ReportButton auditionId={audition.id} isLoggedIn={!!user} />

      <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-md">
          {isExpired ? (
            <div className="rounded-xl bg-gray-100 py-3.5 text-center text-sm font-semibold text-gray-400">
              마감된 오디션입니다
            </div>
          ) : audition.oneclick_blocked ? (
            // 심각 신고 접수 → 확인 전까지 대리 지원 중지 (36 §4)
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
              <p className="text-sm font-bold text-amber-700">
                신고가 접수되어 지원이 일시 중지되었습니다
              </p>
              <p className="mt-0.5 text-xs text-amber-600">
                확인이 끝날 때까지 원문에서 직접 확인해 주세요.
              </p>
            </div>
          ) : audition.apply_type === "external" && audition.source_url ? (
            <a
              href={audition.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-[15px] font-bold text-white hover:bg-primary-hover transition-colors shadow-[0_4px_12px_rgba(99,102,241,0.3)]"
            >
              <Send size={17} />
              지원하러 가기
            </a>
          ) : (
            // useSearchParams(apply=1) 사용 — Suspense 경계 필요
            <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-gray-200" />}>
              <ApplyButton audition={audition} isLoggedIn={!!user} authLoading={authLoading} />
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
}
