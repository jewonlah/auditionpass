import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES, getCategoryBySlug } from "@/lib/categories";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { getInitialAuditions } from "../page";
import { AuditionsClient } from "../AuditionsClient";
import { parseAuditionsSearchParams } from "@/lib/audition/searchParams";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr";
// AuditionsClient의 무한스크롤 페이지 크기(PAGE_SIZE=20)와 맞춰야 한다 — 어긋나면
// 클라이언트 다음 페이지 range가 초기 목록과 겹쳐 카드가 중복 노출된다.
const CATEGORY_LIMIT = 20;

// 검색·정렬 query를 읽으므로 이 페이지는 요청별 렌더링된다.
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

    const title = `${found.genre} 오디션 공고`;
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
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category } = await params;
  const found = getCategoryBySlug(category);
  if (!found) notFound();

  // 공개 공고는 로그인 세션 없이 조회한다.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const query = await searchParams;
  const { filter, q } = parseAuditionsSearchParams(query);
  const sort = query.sort === "latest" ? "latest" : "deadline";
  const items = await getInitialAuditions(
    filter,
    q,
    CATEGORY_LIMIT,
    supabase,
    sort,
    found.genre,
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

      <div className="mt-4">
        <AuditionsClient
          key={`${found.genre}/${filter}/${q}/${sort}`}
          initialItems={items}
          initialFilter={filter}
          initialSearch={q}
          initialSort={sort}
          lockedCategory={found.genre}
        />
      </div>

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
