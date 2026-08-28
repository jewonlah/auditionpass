import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { metaDescription } from "@/lib/audition/description";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://auditionpass.co.kr";

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
      .select("title, company, genre, deadline, description")
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
      .select("title, company, genre, deadline, description, requirements, apply_type, created_at")
      .eq("id", id)
      .single();

    if (audition) {
      // description 에는 수집기가 붙인 "요약만 수집 — 원문 링크 확인" 꼬리표를 넣지 않는다.
      // 활성 공고의 93%에 그 문구가 있었고, 구조화 데이터에 그대로 나가면
      // 검색엔진·AI 에게 "여긴 정보가 없다"고 선언하는 셈이라 인용에서 스스로 빠진다.
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        identifier: { "@type": "PropertyValue", name: "오디션패스", value: id },
        title: audition.title,
        description: metaDescription(audition.description, audition.title, 600),
        datePosted: audition.created_at,
        ...(audition.deadline ? { validThrough: audition.deadline } : {}),
        // Google for Jobs 는 hiringOrganization 을 요구한다. 모집 주체가 비면
        // 수집 출처가 아니라 플랫폼을 적는다(출처는 화면의 source_name 배지로 밝힌다).
        hiringOrganization: {
          "@type": "Organization",
          name: audition.company || "오디션패스 수집 공고",
        },
        industry: "Entertainment",
        occupationalCategory: audition.genre,
        employmentType: "CONTRACTOR",
        // 대부분 촬영·공연 단위라 근무지가 고정되지 않는다. 국가만 명시하고
        // 지역이 확인된 공고에 한해 addressRegion 을 채우는 것은 후속 과제.
        jobLocation: {
          "@type": "Place",
          address: { "@type": "PostalAddress", addressCountry: "KR" },
        },
        applicantLocationRequirements: { "@type": "Country", name: "KR" },
        // 원클릭 지원이 가능한 공고만 directApply=true. 사이트 이동은 false 가 정확하다.
        directApply: audition.apply_type === "email",
        ...(audition.requirements ? { experienceRequirements: audition.requirements } : {}),
      };
    }
  } catch {
    // 구조화 데이터 생성 실패 시 무시
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
