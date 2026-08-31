import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { todayKST } from "@/lib/utils";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr";

// 빌드 시점 DB 쿼리가 실패하면 오디션 URL 0건으로 굳는 문제(2026-08-25 배포 실측) →
// 1시간 ISR로 런타임 재생성. 실패해도 다음 주기에 회복된다.
export const revalidate = 3600;

const PAGE = 1000;              // Supabase 한 번에 가져올 행 수
const MAX_SITEMAP_URLS = 50000; // sitemaps.org 상한

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/auditions`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    // 약관·처리방침은 가입 전 확인 문서이자 소셜 로그인 심사 요건이라 색인 대상이다
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // /pricing은 301 → `/` 처리 후 sitemap에서 제거 (F11 — 라우트 변경 시 301 + sitemap 동시 갱신)
  ];

  // 동적 페이지: 활성 오디션 상세 페이지
  let auditionPages: MetadataRoute.Sitemap = [];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const today = todayKST(); // UTC 사용 시 KST 자정~09시에 마감 공고가 sitemap에 잔류
    // auditions에는 updated_at 컬럼이 없다(created_at만) — updated_at 조회 시 쿼리 전체가
    // 에러로 죽어 sitemap이 정적 4개 URL로 굳는다 (2026-08-25 배포 실측)
    // 2026-08-28: limit(500) 이었다. 활성 공고가 4,400여 건인데 500건만 제출하고 있었다 —
    // 나머지는 내부 링크로만 발견돼야 해서 사실상 색인 밖이었다. 페이지네이션으로 전량 제출한다.
    // (사이트맵 1개당 50,000 URL 이 상한이라 현재 규모는 한 파일로 충분하다)
    const rows: { id: string; created_at: string }[] = [];
    for (let from = 0; from < MAX_SITEMAP_URLS; from += PAGE) {
      const { data, error } = await supabase
        .from("auditions")
        .select("id, created_at")
        .eq("is_active", true)
        .or(`deadline.gte.${today},deadline.is.null`)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }

    auditionPages = rows.map((a) => ({
      url: `${BASE_URL}/audition/${a.id}`,
      lastModified: new Date(a.created_at),
      // 공고 본문은 수집 후 거의 바뀌지 않는다. daily 로 두면 크롤 예산만 낭비된다.
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    // DB 접속 실패 시 정적 페이지만 반환
  }

  return [...staticPages, ...auditionPages];
}
