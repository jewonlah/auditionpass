import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { todayKST } from "@/lib/utils";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://auditionpass.co.kr";

// 빌드 시점 DB 쿼리가 실패하면 오디션 URL 0건으로 굳는 문제(2026-08-25 배포 실측) →
// 1시간 ISR로 런타임 재생성. 실패해도 다음 주기에 회복된다.
export const revalidate = 3600;

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
    const { data } = await supabase
      .from("auditions")
      .select("id, updated_at")
      .eq("is_active", true)
      .or(`deadline.gte.${today},deadline.is.null`)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (data) {
      auditionPages = data.map((a) => ({
        url: `${BASE_URL}/audition/${a.id}`,
        lastModified: new Date(a.updated_at),
        changeFrequency: "daily" as const,
        priority: 0.8,
      }));
    }
  } catch {
    // DB 접속 실패 시 정적 페이지만 반환
  }

  return [...staticPages, ...auditionPages];
}
