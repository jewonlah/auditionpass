import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { parseAuditionsSearchParams } from "@/lib/audition/searchParams";
import { AUDITION_LIST_COLUMNS } from "@/lib/audition/columns";
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
async function getInitialAuditions(filter: string, q: string): Promise<Audition[]> {
  const supabase = await createServerClient();
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
    query = query.eq("genre", filter);
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%`);
  }

  const { data, error } = await query
    .order("deadline", { ascending: true, nullsFirst: false })
    .range(0, PAGE_SIZE - 1);

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
    <AuditionsClient
      initialItems={initialItems}
      initialFilter={filter}
      initialSearch={q}
    />
  );
}
