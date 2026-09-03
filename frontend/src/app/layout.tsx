import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { AttributionTracker } from "@/components/Attribution";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr"
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
    // 네이버 서치어드바이저 소유 확인 (2026-09-01) — 검증 토큰이라 공개돼도 무방
    other: { "naver-site-verification": "b90c09eec57f34ffa63ec71f4ac2ba765c491ccc" },
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F4EF",
  width: "device-width",
  initialScale: 1,
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
          측정 도구. Vercel Analytics(2026-08-28, 무쿠키)와 GA4(2026-09-01, 턴오버 계정
          소유 — 속성 "오디션패스", 자산 허브 원칙)를 병행한다. GA4 는 프로덕션 env 에만
          NEXT_PUBLIC_GA_ID 를 두어 로컬·프리뷰 트래픽이 지표를 오염시키지 않게 한다.
          SPA 라우팅 page_view 는 GA4 향상된 측정(히스토리 변경)이 잡는다.
        */}
        <AttributionTracker />
        <Analytics />
        <SpeedInsights />
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
