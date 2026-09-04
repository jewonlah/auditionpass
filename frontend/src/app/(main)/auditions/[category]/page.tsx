import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { AuditionCard } from "@/components/audition/AuditionCard";
import { CATEGORIES, getCategoryBySlug } from "@/lib/categories";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { getInitialAuditions } from "../page";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr";
const CATEGORY_LIMIT = 30;

// 카테고리별 대표 공고는 크롤 주기(하루 1회)에 맞춰 갱신하면 충분하다 (12_ia-userflows §1.2).
export const revalidate = 3600;

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  return params.then(({ category }) => {
    const found = getCategoryBySlug(category);
    if (!found) return { title: "카테고리 없음" };

    const title = `${found.genre} 오디션 공고 | 오디션패스`;
    const description = `${found.genre} 분야 오디션 공고를 모아봤어요. 마감 임박순으로 확인하고 원클릭으로 지원하세요.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        locale: "ko_KR",
        siteName: "오디션패스",
        url: `${BASE_URL}/auditions/${found.slug}`,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
      alternates: {
        canonical: `/auditions/${found.slug}`,
      },
    };
  });
}

export default async function CategoryLandingPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const found = getCategoryBySlug(category);
  if (!found) notFound();

  // 쿠키 없는 anon 클라이언트 — cookies()를 쓰면 라우트가 Dynamic으로 굳어 revalidate/
  // generateStaticParams가 무효해진다(D3, sitemap.ts와 동일 패턴).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const items = await getInitialAuditions(
    found.genre,
    "",
    CATEGORY_LIMIT,
    supabase
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/audition/${a.id}`,
      name: a.title,
    })),
  };

  const otherCategories = CATEGORIES.filter((c) => c.slug !== found.slug);

  return (
    <div className="pb-8">
      {items.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}

      <h1 className="text-xl font-bold text-gray-900">
        {found.genre} 오디션 공고
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        {found.genre} 분야 오디션 공고를 모아봤어요. 마감 임박순으로 확인하고
        원클릭으로 지원하세요.
      </p>

      {items.length > 0 ? (
        <div className="mt-4 space-y-4">
          {items.map((audition) => (
            <AuditionCard key={audition.id} audition={audition} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-gray-400">
          현재 진행 중인 {found.genre} 오디션이 없어요.
        </p>
      )}

      <nav className="mt-8 border-t border-gray-100 pt-4" aria-label="다른 분야 오디션">
        <p className="mb-2 text-xs font-semibold text-gray-400">다른 분야 오디션</p>
        <div className="flex flex-wrap gap-2">
          {otherCategories.map((c) => (
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
    </div>
  );
}
