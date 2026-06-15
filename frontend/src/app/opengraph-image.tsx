import { ImageResponse } from "next/og";
import { loadGoogleFont } from "@/lib/og/font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "오디션패스 — 당신의 다음 무대";

const BRAND = "오디션패스";
const SLOGAN = "당신의 다음 무대";
const SUB = "배우·모델 오디션 정보를 한 곳에서, 버튼 하나로 원클릭 지원";
const HANDLE = "auditionpass.co.kr";

export default async function Image() {
  const text = BRAND + SLOGAN + SUB + HANDLE + "AUDITIONPASS";

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
          justifyContent: "center",
          padding: "90px",
          background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
          color: "#ffffff",
          fontFamily: "Noto Sans KR",
        }}
      >
        <div
          style={{
            fontSize: 30,
            fontWeight: 400,
            opacity: 0.85,
            letterSpacing: "0.18em",
          }}
        >
          AUDITIONPASS
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 900,
            marginTop: 20,
            lineHeight: 1.1,
          }}
        >
          {SLOGAN}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 36,
            fontWeight: 400,
            marginTop: 28,
            opacity: 0.92,
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          {SUB}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: 28,
            fontWeight: 400,
            opacity: 0.8,
          }}
        >
          {HANDLE}
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
