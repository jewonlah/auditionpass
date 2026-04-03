"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
  Tag,
  Loader2,
  Clock,
  Send,
} from "lucide-react";
import { ApplyButton } from "@/components/audition/ApplyButton";
import { DescriptionRenderer } from "@/components/audition/DescriptionRenderer";
import { useAuth } from "@/hooks/useAuth";
import { formatDday, getDday, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Audition } from "@/types";

interface ApplyStatus {
  hasProfile: boolean;
  hasApplied: boolean;
  canApply: boolean;
  canWatchAd: boolean;
  plan: string;
  todayCount: number;
  adBonus: number;
  maxApplies: number;
  remaining: number;
  loading: boolean;
}

const DEFAULT_STATUS: ApplyStatus = {
  hasProfile: false,
  hasApplied: false,
  canApply: true,
  canWatchAd: true,
  plan: "free",
  todayCount: 0,
  adBonus: 0,
  maxApplies: 1,
  remaining: 1,
  loading: true,
};

const GENRE_COLORS: Record<string, string> = {
  배우: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  모델: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200",
  기타: "bg-slate-100 text-slate-600 border border-slate-200",
};

export default function AuditionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [audition, setAudition] = useState<Audition | null>(null);
  const [auditionLoading, setAuditionLoading] = useState(true);
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>(DEFAULT_STATUS);
  const supabase = createClient();

  useEffect(() => {
    async function fetchAudition() {
      const { data, error } = await supabase
        .from("auditions")
        .select("*")
        .eq("id", id)
        .single();

      if (!error && data) {
        setAudition(data);
      }
      setAuditionLoading(false);
    }

    fetchAudition();
  }, [id, supabase]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setApplyStatus((prev) => ({ ...prev, loading: false }));
      return;
    }

    async function checkApplyStatus() {
      try {
        const res = await fetch(`/api/apply/check?auditionId=${id}`);
        if (res.ok) {
          const data = await res.json();
          setApplyStatus({
            hasProfile: data.hasProfile,
            hasApplied: data.hasApplied,
            canApply: data.canApply,
            canWatchAd: data.canWatchAd,
            plan: data.plan,
            todayCount: data.todayCount,
            adBonus: data.adBonus,
            maxApplies: data.maxApplies,
            remaining: data.remaining,
            loading: false,
          });
        } else {
          setApplyStatus((prev) => ({ ...prev, loading: false }));
        }
      } catch {
        setApplyStatus((prev) => ({ ...prev, loading: false }));
      }
    }

    checkApplyStatus();
  }, [user, authLoading, id]);

  const handleStatusChange = useCallback(
    (updates: Partial<ApplyStatus>) => {
      setApplyStatus((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  if (auditionLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!audition) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-gray-500 mb-4">오디션 정보를 찾을 수 없습니다.</p>
        <button
          onClick={() => router.push("/")}
          className="text-primary font-semibold hover:underline"
        >
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  const dday = getDday(audition.deadline);
  const isExpired = dday !== null && dday < 0;
  const isUrgent = dday !== null && dday >= 0 && dday <= 3;
  const isWarning = dday !== null && dday >= 0 && dday <= 7;

  return (
    <div className="pb-28">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4 -ml-1 transition-colors"
      >
        <ArrowLeft size={18} />
        <span>뒤로가기</span>
      </button>

      {/* 헤더 카드 */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(99,102,241,0.06)]">
        {/* 배지 영역 */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ${GENRE_COLORS[audition.genre] ?? GENRE_COLORS["기타"]}`}
          >
            {audition.genre}
          </span>
          {audition.apply_type === "email" ? (
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600 border border-emerald-200">
              원클릭 지원
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-400 border border-gray-200">
              사이트 지원
            </span>
          )}
        </div>

        {/* 제목 */}
        <h1 className="text-xl font-bold leading-tight text-gray-900 mb-4">
          {audition.title}
        </h1>

        {/* 메타 정보 */}
        <div className="space-y-2">
          {audition.company && (
            <div className="flex items-center gap-2.5 text-sm text-gray-500">
              <Building2 size={15} className="shrink-0 text-gray-400" />
              <span>{audition.company}</span>
            </div>
          )}
          {audition.deadline && (
            <div className="flex items-center gap-2.5 text-sm">
              <Calendar size={15} className="shrink-0 text-gray-400" />
              <span className="text-gray-500">
                {formatDate(audition.deadline)}
              </span>
              <span
                className={`ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
                  isExpired
                    ? "bg-gray-100 text-gray-400"
                    : isUrgent
                      ? "bg-red-50 text-red-600"
                      : isWarning
                        ? "bg-amber-50 text-amber-600"
                        : "bg-indigo-50 text-indigo-600"
                }`}
              >
                <Clock size={11} />
                {isExpired ? "마감" : formatDday(audition.deadline)}
              </span>
            </div>
          )}
          {audition.source_name && (
            <div className="flex items-center gap-2.5 text-sm text-gray-500">
              <Tag size={15} className="shrink-0 text-gray-400" />
              <span>{audition.source_name}</span>
            </div>
          )}
        </div>
      </div>

      {/* 상세 정보 */}
      {audition.description && (
        <section className="mt-3 rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(99,102,241,0.06)]">
          <h2 className="text-base font-bold text-gray-900 mb-3">상세 정보</h2>
          <DescriptionRenderer text={audition.description} />
        </section>
      )}

      {/* 원문 공고 링크 */}
      {audition.source_url && (
        <a
          href={audition.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] text-sm text-primary font-semibold hover:bg-indigo-50 transition-colors"
        >
          원문 공고 보기
          <ExternalLink size={15} />
        </a>
      )}

      {/* 지원 버튼 (고정 하단) */}
      <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-md">
          {isExpired ? (
            <div className="rounded-xl bg-gray-100 py-3.5 text-center text-sm font-semibold text-gray-400">
              마감된 오디션입니다
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
            <ApplyButton
              auditionId={audition.id}
              status={applyStatus}
              isLoggedIn={!!user}
              loading={authLoading || applyStatus.loading}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
