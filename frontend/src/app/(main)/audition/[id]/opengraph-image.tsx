import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { loadGoogleFont } from "@/lib/og/font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "오디션 공고 — 오디션패스";

const BRAND = "오디션패스";
const SLOGAN = "당신의 다음 무대";

interface Props {
  params: Promise<{ id: string }>;
}

/** deadline(YYYY-MM-DD)으로 D-day 라벨 계산 */
function ddayLabel(deadline: string | null): { label: string; urgent: boolean } {
  if (!deadline) return { label: "상시 모집", urgent: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(deadline);
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: "마감", urgent: false };
  if (diff === 0) return { label: "오늘 마감", urgent: true };
  return { label: `D-${diff}`, urgent: diff <= 3 };
}

export default async function Image({ params }: Props) {
  const { id } = await params;

  let title = "오디션 공고";
  let company: string | null = null;
  let genre = "오디션";
  let deadline: string | null = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from("auditions")
      .select("title, company, genre, deadline")
      .eq("id", id)
      .single();
    if (data) {
      title = data.title || title;
      company = data.company;
      genre = data.genre || genre;
      deadline = data.deadline;
    }
  } catch {
    // 조회 실패 시 기본값으로 렌더
  }

  const dday = ddayLabel(deadline);
  const ddayBg = dday.urgent ? "#EF4444" : "#6B7280";

  // 렌더링에 등장하는 모든 문자를 폰트 서브셋 텍스트로 전달
  const text =
    title +
    (company ?? "") +
    genre +
    dday.label +
    BRAND +
    SLOGAN +
    "AUDITIONPASS 0123456789D-";

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
          background: "#ffffff",
          fontFamily: "Noto Sans KR",
        }}
      >
        {/* 상단: 카테고리 + D-day 배지 */}
        <div style={{ display: "flex", gap: 16 }}>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              color: "#ffffff",
              background: "#F0330F",
              padding: "10px 28px",
              borderRadius: 9999,
            }}
          >
            {genre}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              color: "#ffffff",
              background: ddayBg,
              padding: "10px 28px",
              borderRadius: 9999,
            }}
          >
            {dday.label}
          </div>
        </div>

        {/* 제목 (최대 3줄 클램프) */}
        <div
          style={{
            display: "-webkit-box",
            fontSize: 68,
            fontWeight: 900,
            color: "#111827",
            lineHeight: 1.25,
            marginTop: 36,
            overflow: "hidden",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {title}
        </div>

        {/* 주최사 */}
        {company && (
          <div
            style={{
              display: "flex",
              fontSize: 36,
              fontWeight: 400,
              color: "#6B7280",
              marginTop: 24,
            }}
          >
            {company}
          </div>
        )}

        {/* 하단 브랜드 바 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "auto",
            paddingTop: 32,
            borderTop: "2px solid #F3F4F6",
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
              color: "#9CA3AF",
              marginLeft: 20,
            }}
          >
            {SLOGAN}
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
