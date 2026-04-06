import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

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
      return { title: "오디션 정보 없음 | 오디션패스" };
    }

    const title = `${audition.title} | 오디션패스`;
    const description =
      audition.description?.slice(0, 155) ||
      `${audition.company || ""} ${audition.genre} 오디션 — 오디션패스에서 원클릭으로 지원하세요.`;

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
        card: "summary",
        title,
        description,
      },
      alternates: {
        canonical: `/audition/${id}`,
      },
    };
  } catch {
    return { title: "오디션 상세 | 오디션패스" };
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
      .select("title, company, genre, deadline, description, created_at")
      .eq("id", id)
      .single();

    if (audition) {
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: audition.title,
        description: audition.description || audition.title,
        datePosted: audition.created_at,
        validThrough: audition.deadline || undefined,
        hiringOrganization: audition.company
          ? {
              "@type": "Organization",
              name: audition.company,
            }
          : undefined,
        industry: "Entertainment",
        occupationalCategory: audition.genre,
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressCountry: "KR",
          },
        },
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
