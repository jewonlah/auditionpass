import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { metaDescription } from "@/lib/audition/description";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { todayKST } from "@/lib/utils";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: audition } = await supabase
      .from("auditions")
      .select("title, company, genre, deadline, description, is_active, review_status")
      .eq("id", id)
      .single();

    if (!audition) {
      return { title: "오디션 정보 없음" };
    }

    // 루트 layout 의 title.template("%s | 오디션패스")이 접미사를 붙인다.
    // 여기서 또 붙이면 "제목 | 오디션패스 | 오디션패스" 가 된다 (2026-08-28 실측 후 수정).
    const title = audition.title;
    const description = metaDescription(
      audition.description,
      `${audition.company || ""} ${audition.genre} 오디션 — 오디션패스에서 원클릭으로 지원하세요.`.trim()
    );

    return {
      title,
      description,
      robots: { index: audition.is_active && !["pending", "quarantine"].includes(audition.review_status) && (!audition.deadline || audition.deadline >= todayKST()), follow: true },
      openGraph: {
        title,
        description,
        type: "article",
        locale: "ko_KR",
        siteName: "오디션패스",
        url: `${BASE_URL}/audition/${id}`,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
      alternates: {
        canonical: `/audition/${id}`,
      },
    };
  } catch {
    return { title: "오디션 상세" };
  }
}

export default async function AuditionDetailLayout({ params, children }: Props) {
  const { id } = await params;

  // JSON-LD 구조화 데이터
  let jsonLd = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: audition } = await supabase
      .from("auditions")
      .select("title, company, genre, deadline, description, requirements, apply_type, created_at, is_active, review_status")
      .eq("id", id)
      .single();

    if (audition && audition.is_active && !["pending", "quarantine"].includes(audition.review_status) && (!audition.deadline || audition.deadline >= todayKST())) {
      // description 에는 수집기가 붙인 "요약만 수집 — 원문 링크 확인" 꼬리표를 넣지 않는다.
      // 활성 공고의 93%에 그 문구가 있었고, 구조화 데이터에 그대로 나가면
      // 검색엔진·AI 에게 "여긴 정보가 없다"고 선언하는 셈이라 인용에서 스스로 빠진다.
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        identifier: { "@type": "PropertyValue", name: "오디션패스", value: id },
        name: audition.title,
        url: `${BASE_URL}/audition/${id}`,
        description: metaDescription(audition.description, audition.title, 600),
        datePublished: audition.created_at,
        // The source data does not establish employment type/location. Do not invent JobPosting fields.
      };
    }
  } catch {
    // 구조화 데이터 생성 실패 시 무시
  }

  return (
    <>
      {/* 값은 크롤·LLM이 만든 신뢰할 수 없는 텍스트다. JSON.stringify는 `<`를 이스케이프하지
          않아 본문의 `</script>` 가 여기서 스크립트를 끝내 버린다(저장형 XSS) — serializeJsonLd 필수. */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
