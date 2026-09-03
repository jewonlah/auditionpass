import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr";

/**
 * robots.txt
 *
 * 2026-08-28: AI 답변엔진 크롤러를 명시 허용으로 바꿨다.
 * `User-agent: *` 로도 기술적으로는 허용되지만, 명시하면 (a) 의도가 분명해지고
 * (b) 나중에 특정 봇만 조이거나 풀 때 이 파일 한 곳만 고치면 된다.
 *
 * 배경: 상세 페이지가 클라이언트 렌더라 GPTBot 이 받아가는 본문이 59자였다.
 * SSR 로 전환(388자)했으니 이제 크롤을 허용하는 게 실제로 의미가 있다.
 *
 * 차단 대상은 "색인할 이유가 없는 개인/운영 화면"이다. 크롤 예산을 공고로 몰아준다.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    "/auth/",
    "/admin", // 운영자 전용 — 게이트가 있지만 크롤 대상도 아니다
    "/profile",
    "/home", // 로그인 후 개인화 피드
    "/onboarding", // 가입 직후 1회성 게이트 — 색인 대상 아님
    "/applications",
    "/my",
  ];

  // 답변엔진 크롤러. 인용되려면 본문을 읽어갈 수 있어야 한다.
  const aiBots = [
    "GPTBot", // OpenAI 학습·검색
    "OAI-SearchBot", // ChatGPT 검색 인용
    "ChatGPT-User", // 사용자가 링크를 열 때
    "ClaudeBot",
    "Claude-User",
    "Claude-SearchBot",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended", // Gemini
    "Applebot-Extended",
    "Bingbot",
    "Yeti", // 네이버
    "Daumoa", // 다음
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      ...aiBots.map((userAgent) => ({ userAgent, allow: "/", disallow })),
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
