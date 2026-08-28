import { notFound } from "next/navigation";
import { Building2, Calendar, Clock, ExternalLink, Tag } from "lucide-react";
import { DescriptionRenderer } from "@/components/audition/DescriptionRenderer";
import { TrustBadge } from "@/components/audition/TrustBadge";
import { AuditionActions, BackButton } from "@/components/audition/AuditionActions";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { stripSourceNote } from "@/lib/audition/description";
import { formatDday, getDday, formatDate } from "@/lib/utils";
import type { Audition } from "@/types";

/**
 * 공고 상세 — 서버 렌더 (2026-08-28 전환).
 *
 * 그전에는 "use client" 라 본문이 HTML 에 없었다. GPTBot 으로 받아보면 실제 텍스트가
 * 59자(네비게이션뿐)이고 h1 은 0개였다. 구글은 JS 를 실행하지만 GPTBot·ClaudeBot·
 * PerplexityBot 은 실행하지 않아, 공고 4,400여 건이 AI 검색에서 통째로 비어 있었다.
 *
 * ISR 로 캐시한다. 공고는 하루 1회 크롤에서만 바뀌므로 요청마다 DB 를 칠 이유가 없고,
 * 캐시된 HTML 이 크롤러에게 더 빨리·안정적으로 응답된다.
 */
export const revalidate = 600;

const GENRE_COLORS: Record<string, string> = {
  배우: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  모델: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200",
  기타: "bg-slate-100 text-slate-600 border border-slate-200",
};

async function getAudition(id: string): Promise<Audition | null> {
  // 상세는 공개 페이지다. RLS 정책에 걸려 빈 페이지가 나가는 일이 없도록 서비스 클라이언트로
  // 읽되, 노출하는 필드는 화면에 쓰는 것으로 한정한다(apply_email 은 절대 내보내지 않는다 — 36 §4).
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("auditions")
    .select(
      "id,title,company,genre,deadline,description,requirements,source_url,source_name,apply_type,oneclick_blocked,is_active,quality_score,review_status,created_at"
    )
    .eq("id", id)
    .maybeSingle();
  return (data as Audition | null) ?? null;
}

export default async function AuditionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audition = await getAudition(id);

  // 404 를 명확히 돌려줘야 색인에서 빠진다. 예전에는 200 + "찾을 수 없습니다" 였다.
  if (!audition) notFound();

  const dday = getDday(audition.deadline);
  const isExpired = dday !== null && dday < 0;
  const isUrgent = dday !== null && dday >= 0 && dday <= 3;
  const isWarning = dday !== null && dday >= 0 && dday <= 7;
  const body = stripSourceNote(audition.description);

  return (
    <div className="pb-28">
      <BackButton />

      <article>
        {/* 헤더 카드 */}
        <header className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(99,102,241,0.06)]">
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ${
                GENRE_COLORS[audition.genre] ?? GENRE_COLORS["기타"]
              }`}
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

          <h1 className="text-xl font-bold leading-tight text-gray-900 mb-4">
            {audition.title}
          </h1>

          {/* 핵심 정보 — 정의 목록으로 둔다. AI 가 "무엇이 무엇인지" 그대로 인용할 수 있다. */}
          <dl className="space-y-2">
            {audition.company && (
              <div className="flex items-center gap-2.5 text-sm text-gray-500">
                <Building2 size={15} className="shrink-0 text-gray-400" aria-hidden />
                <dt className="sr-only">모집 주체</dt>
                <dd>{audition.company}</dd>
              </div>
            )}
            {audition.deadline && (
              <div className="flex items-center gap-2.5 text-sm">
                <Calendar size={15} className="shrink-0 text-gray-400" aria-hidden />
                <dt className="sr-only">마감일</dt>
                <dd className="flex items-center gap-2">
                  <time dateTime={audition.deadline} className="text-gray-500">
                    {formatDate(audition.deadline)}
                  </time>
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
                      isExpired
                        ? "bg-gray-100 text-gray-400"
                        : isUrgent
                          ? "bg-red-50 text-red-600"
                          : isWarning
                            ? "bg-amber-50 text-amber-600"
                            : "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    <Clock size={11} aria-hidden />
                    {isExpired ? "마감" : formatDday(audition.deadline)}
                  </span>
                </dd>
              </div>
            )}
            {audition.source_name && (
              <div className="flex items-center gap-2.5 text-sm text-gray-500">
                <Tag size={15} className="shrink-0 text-gray-400" aria-hidden />
                <dt className="sr-only">출처</dt>
                <dd>{audition.source_name}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 border-t border-gray-100 pt-3">
            <TrustBadge audition={audition} showHint />
          </div>
        </header>

        {body && (
          <section className="mt-3 rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(99,102,241,0.06)]">
            <h2 className="text-base font-bold text-gray-900 mb-3">모집 상세</h2>
            <DescriptionRenderer text={body} />
          </section>
        )}

        {audition.requirements && (
          <section className="mt-3 rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(99,102,241,0.06)]">
            <h2 className="text-base font-bold text-gray-900 mb-3">지원 자격</h2>
            <DescriptionRenderer text={audition.requirements} />
          </section>
        )}
      </article>

      {audition.source_url && (
        <a
          href={audition.source_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] text-sm text-primary font-semibold hover:bg-indigo-50 transition-colors"
        >
          원문 공고 보기
          <ExternalLink size={15} aria-hidden />
        </a>
      )}

      <AuditionActions audition={audition} isExpired={isExpired} />
    </div>
  );
}
