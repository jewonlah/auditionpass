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
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ApplyButton } from "@/components/audition/ApplyButton";
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

  // Supabase에서 오디션 데이터 fetch
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

  // 로그인 상태일 때 지원 가능 여부 확인
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

  // 로딩 중
  if (auditionLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  // 오디션 없음
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
  const ddayVariant =
    isExpired
      ? "default"
      : dday !== null && dday <= 3
        ? "danger"
        : dday !== null && dday <= 7
          ? "warning"
          : "default";

  return (
    <div className="pb-28">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 -ml-1"
      >
        <ArrowLeft size={18} />
        <span>뒤로가기</span>
      </button>

      {/* 헤더 영역 */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <Badge variant={ddayVariant} className="shrink-0">
            {isExpired ? "마감" : formatDday(audition.deadline)}
          </Badge>
          <Badge>{audition.genre}</Badge>
        </div>

        <h1 className="text-xl font-bold leading-tight mb-2">
          {audition.title}
        </h1>

        <div className="space-y-1.5 text-sm text-gray-500">
          {audition.company && (
            <div className="flex items-center gap-2">
              <Building2 size={15} className="shrink-0" />
              <span>{audition.company}</span>
            </div>
          )}
          {audition.deadline && (
            <div className="flex items-center gap-2">
              <Calendar size={15} className="shrink-0" />
              <span>마감일: {formatDate(audition.deadline)}</span>
            </div>
          )}
          {audition.source_name && (
            <div className="flex items-center gap-2">
              <Tag size={15} className="shrink-0" />
              <span>출처: {audition.source_name}</span>
            </div>
          )}
        </div>
      </div>

      {/* 상세 정보 */}
      {audition.description && (
        <section className="mt-4 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold mb-3">상세 정보</h2>
          <div className="text-sm text-gray-600 leading-relaxed space-y-1">
            {audition.description.split("\n").map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={i} className="h-2" />;
              // bullet point 라인 (•, -, *, ·)
              const isBullet = /^[•\-\*·▸▹►]/.test(trimmed);
              return (
                <p key={i} className={isBullet ? "pl-1" : ""}>
                  {trimmed}
                </p>
              );
            })}
          </div>
        </section>
      )}

      {/* 원문 공고 링크 */}
      {audition.source_url && (
        <a
          href={audition.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white p-4 shadow-sm text-sm text-primary font-semibold hover:bg-primary/5 transition-colors"
        >
          원문 공고 보기
          <ExternalLink size={16} />
        </a>
      )}

      {/* 지원 버튼 (고정 하단) */}
      <div className="fixed bottom-16 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-md">
          {isExpired ? (
            <div className="rounded-lg bg-gray-100 py-3 text-center text-sm font-semibold text-gray-400">
              마감된 오디션입니다
            </div>
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
