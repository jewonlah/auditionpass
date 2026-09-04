import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { parseAuditionsSearchParams } from "@/lib/audition/searchParams";
import { AUDITION_LIST_COLUMNS } from "@/lib/audition/columns";
import { CATEGORIES } from "@/lib/categories";
import { AuditionsClient } from "./AuditionsClient";
import type { Audition } from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr";
const PAGE_SIZE = 20;

export function generateMetadata(): Metadata {
  const title = "오디션 탐색";
  const description =
    "오늘 올라온 배우·모델 오디션 공고를 한눈에 확인하고 원클릭으로 지원하세요.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      siteName: "오디션패스",
      url: `${BASE_URL}/auditions`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    // 필터·검색 쿼리 변형은 모두 기본 URL로 수렴 (F9 — 리스트 메타 canonical)
    alternates: {
      canonical: "/auditions",
    },
  };
}

/**
 * 탐색 리스트 첫 페이지 서버 페치 — SSR 전환(F7+F9).
 *
 * apply_email은 select 자체에서 제외한다(오디션 상세 `getAudition`과 동일 원칙 — 36 §4,
 * `AUDITION_LIST_COLUMNS`는 클라이언트 fetch(AuditionsClient)와 공유하는 단일 소스).
 * apply_email:null은 타입(Audition)을 맞추기 위한 표기일 뿐, 실제로 DB에서 가져오지도
 * 않는다 — 초기 HTML/RSC 페이로드는 크롤러가 그대로 읽어가는 층이라 노출 표면이 크다.
 */
export async function getInitialAuditions(
  filter: string,
  q: string,
  limit: number = PAGE_SIZE,
  // 카테고리 랜딩(`[category]/page.tsx`)은 쿠키 없는 anon 클라이언트를 넘겨 ISR을 유지한다.
  // cookies()를 쓰는 createServerClient()는 라우트를 강제로 Dynamic으로 만든다(D3).
  supabaseClient?: SupabaseClient
): Promise<Audition[]> {
  const supabase = supabaseClient ?? (await createServerClient());
  const today = todayKST();

  let query = supabase
    .from("auditions")
    .select(AUDITION_LIST_COLUMNS)
    .eq("is_active", true)
    .or(`deadline.gte.${today},deadline.is.null`);

  if (filter === "원클릭지원") {
    query = query.eq("apply_type", "email");
  } else if (filter === "사이트지원") {
    query = query.eq("apply_type", "external");
  } else if (filter !== "전체") {
    // category(007, 14개 상세 분류) 우선, 백필 누락 행은 genre(배우/모델/기타 3개)로 폴백.
    // 필터값에 콤마가 없으면 or() DSL 인용 없이 안전(PostgREST or 특수문자는 콤마만).
    query = query.or(
      `category.eq.${filter},and(category.is.null,genre.eq.${filter})`
    );
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%`);
  }

  const { data, error } = await query
    .order("deadline", { ascending: true, nullsFirst: false })
    .range(0, limit - 1);

  if (error || !data) return [];

  return data
    .filter((a) => !a.deadline || a.deadline >= today)
    .map((a) => ({ ...a, apply_email: null }) as Audition);
}

export default async function AuditionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { filter, q } = parseAuditionsSearchParams(await searchParams);
  const initialItems = await getInitialAuditions(filter, q);

  return (
    <>
      <AuditionsClient
        initialItems={initialItems}
        initialFilter={filter}
        initialSearch={q}
      />

      {/* 서버 렌더 내부 링크 — sitemap 밖에서 카테고리 랜딩을 발견할 유일한 경로 (D4) */}
      <nav className="mt-8 border-t border-gray-100 pt-4" aria-label="분야별 오디션">
        <p className="mb-2 text-xs font-semibold text-gray-400">분야별 오디션</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/auditions/${c.slug}`}
              className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
            >
              {c.genre}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
