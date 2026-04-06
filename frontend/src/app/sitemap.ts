import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://auditionpass.co.kr";

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
    {
      url: `${BASE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  // 동적 페이지: 활성 오디션 상세 페이지
  let auditionPages: MetadataRoute.Sitemap = [];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const today = new Date().toISOString().split("T")[0];
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
