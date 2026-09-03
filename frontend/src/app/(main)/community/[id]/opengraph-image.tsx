import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { loadGoogleFont } from "@/lib/og/font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "커뮤니티 글 — 오디션패스";

const BRAND = "오디션패스";
const TAG = "오디션패스 커뮤니티";

const CATEGORY_COLORS: Record<string, string> = {
  자유: "#877F72",
  꿀팁: "#FF8A1E",
  후기: "#0F9D58",
  질문: "#2563EB",
  구인: "#E07000",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Image({ params }: Props) {
  const { id } = await params;

  let title = "오디션패스 커뮤니티";
  let category = "자유";
  let found = false;

  try {
    // 공개 페이지 — is_active=true는 RLS 공개 조회 정책 대상이라 anon 키로 충분하다.
    // service role은 삭제·비공개(is_active=false) 글까지 그대로 읽어와 OG 이미지에
    // 삭제된 글 제목이 노출되는 사고로 이어졌다 (Codex 리뷰).
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from("community_posts")
      .select("title, category")
      .eq("id", id)
      .eq("is_active", true)
      .single();
    if (data) {
      title = data.title || title;
      category = data.category || category;
      found = true;
    }
  } catch {
    // 조회 실패 시 기본값으로 렌더
  }

  const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS["자유"];
  const text = title + category + BRAND + TAG + "AUDITIONPASS";

  const [bold, regular] = await Promise.all([
    loadGoogleFont("Noto Sans KR", text, 900),
    loadGoogleFont("Noto Sans KR", text, 400),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          background: "#F7F4EF",
          fontFamily: "Noto Sans KR",
        }}
      >
        {/* 카테고리 배지 — 글을 찾지 못하면(삭제·비공개) 기본 이미지로, 배지도 생략 */}
        {found && (
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              color: "#ffffff",
              background: categoryColor,
              padding: "10px 28px",
              borderRadius: 9999,
              alignSelf: "flex-start",
            }}
          >
            {category}
          </div>
        )}

        {/* 제목 (최대 4줄 클램프) */}
        <div
          style={{
            display: "-webkit-box",
            fontSize: 64,
            fontWeight: 900,
            color: "#141110",
            lineHeight: 1.3,
            marginTop: 36,
            overflow: "hidden",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
          }}
        >
          {title}
        </div>

        {/* 하단 브랜드 바 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "auto",
            paddingTop: 32,
            borderTop: "2px solid #DCD1C1",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 34,
              fontWeight: 900,
              color: "#F0330F",
            }}
          >
            {BRAND}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 400,
              color: "#877F72",
              marginLeft: 20,
            }}
          >
            커뮤니티
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Noto Sans KR", data: bold, weight: 900, style: "normal" },
        { name: "Noto Sans KR", data: regular, weight: 400, style: "normal" },
      ],
    }
  );
}
