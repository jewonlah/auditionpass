import type { Metadata, Viewport } from "next";
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
      </body>
    </html>
  );
}
