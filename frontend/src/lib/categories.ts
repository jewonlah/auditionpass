import { PROFILE_GENRES } from "@/lib/profile";

export interface Category {
  /** DB `genre`/`category` 컬럼 값 (007_category_system, PROFILE_GENRES와 동일 소스) */
  genre: (typeof PROFILE_GENRES)[number];
  /** URL 슬러그 (영문) — SEO 랜딩 `/auditions/[category]` */
  slug: string;
}

/** 12_ia-userflows §1.2 — SEO 랜딩 14개. genre 값은 PROFILE_GENRES(007 확정값)를 그대로 재사용. */
export const CATEGORIES: Category[] = [
  { genre: "배우", slug: "actor" },
  { genre: "모델", slug: "model" },
  { genre: "아이돌", slug: "idol" },
  { genre: "키즈모델", slug: "kids-model" },
  { genre: "가수", slug: "singer" },
  { genre: "트로트", slug: "trot" },
  { genre: "촬영모델", slug: "photo-model" },
  { genre: "뮤지컬", slug: "musical" },
  { genre: "연극", slug: "theater" },
  { genre: "성우", slug: "voice-actor" },
  { genre: "댄서", slug: "dancer" },
  { genre: "MC/진행자", slug: "mc" },
  { genre: "엑스트라", slug: "extra" },
  { genre: "인플루언서", slug: "influencer" },
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
