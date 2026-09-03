import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { metaDescription } from "@/lib/audition/description";
import { serializeJsonLd } from "@/lib/seo/jsonld";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

// 공개 페이지 — is_active=true는 RLS 공개 조회 정책 대상이라 anon 키로 충분하다.
// service role 폴백은 삭제·비공개 글까지 그대로 읽어 메타·OG에 노출시키는 사고로
// 이어졌다 (Codex 리뷰) — 여기서는 절대 쓰지 않는다.
function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const supabase = getClient();
    const { data: post } = await supabase
      .from("community_posts")
      .select("title, content")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (!post) {
      return { title: "게시글을 찾을 수 없음" };
    }

    // 루트 layout의 title.template("%s | 오디션패스")이 아니라 커뮤니티 전용 접미사가
    // 필요해 absolute로 템플릿을 우회한다 — 그대로 두면 접미사가 두 번 붙는다
    // (audition/[id]/layout.tsx의 동일 주석 참고).
    const title = `${post.title} | 오디션패스 커뮤니티`;
    const description = metaDescription(
      post.content,
      "오디션 준비생들의 후기·꿀팁·질문을 나누는 오디션패스 커뮤니티.",
      150
    );

    return {
      title: { absolute: title },
      description,
      openGraph: {
        title: post.title,
        description,
        type: "article",
        locale: "ko_KR",
        siteName: "오디션패스",
        url: `${BASE_URL}/community/${id}`,
      },
      twitter: {
        card: "summary_large_image",
        title: post.title,
        description,
      },
      alternates: {
        canonical: `/community/${id}`,
      },
    };
  } catch {
    return { title: "커뮤니티 글" };
  }
}

export default async function CommunityDetailLayout({ params, children }: Props) {
  const { id } = await params;

  let jsonLd: Record<string, unknown> | null = null;

  try {
    const supabase = getClient();
    const { data: post } = await supabase
      .from("community_posts")
      .select(
        "title, content, created_at, updated_at, profiles!community_posts_user_id_profiles_fkey(name)"
      )
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (post) {
      const profile = post.profiles as unknown as { name: string } | null;
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: metaDescription(post.content, post.title, 300),
        datePublished: post.created_at,
        dateModified: post.updated_at,
        // 닉네임만 노출 — 이메일 등 개인정보는 절대 포함하지 않는다.
        author: { "@type": "Person", name: profile?.name || "익명" },
        publisher: {
          "@type": "Organization",
          name: "오디션패스",
          logo: {
            "@type": "ImageObject",
            url: `${BASE_URL}/icons/icon-512x512.png`,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${BASE_URL}/community/${id}`,
        },
      };
    }
  } catch {
    // 구조화 데이터 생성 실패 시 무시 — 본문 렌더는 계속된다
  }

  return (
    <>
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
