import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { AttributionTracker } from "@/components/Attribution";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://auditionpass.co.kr"
  ),
  title: {
    default: "오디션패스 | 배우·모델 오디션 정보를 한 곳에서",
    template: "%s | 오디션패스",
  },
  description:
    "배우·모델 오디션 정보를 자동 수집하고, 버튼 하나로 포트폴리오를 자동 전송하는 원클릭 오디션 지원 플랫폼",
  keywords: [
    "오디션",
    "오디션 정보",
    "배우 오디션",
    "모델 오디션",
    "캐스팅",
    "오디션패스",
    "원클릭 지원",
    "배우 지망생",
    "모델 지망생",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "오디션패스",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "오디션패스",
  },
  twitter: {
    card: "summary_large_image",
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export const viewport: Viewport = {
  themeColor: "#6366F1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        {/*
          측정 도구 (2026-08-28 도입). 이전에는 아무 애널리틱스도 없어 방문자·유입경로·이탈을
          전혀 알 수 없었다 — 가입 2명·7일 지원 0건이라는 DB 수치 외에 판단 근거가 없었다.
          Vercel Analytics 는 쿠키를 쓰지 않아 개인정보 동의 배너 없이 바로 수집할 수 있다.
          퍼널·이벤트 추적이 필요해지면 그때 GA4 를 동의 처리와 함께 추가한다.
        */}
        <AttributionTracker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
