import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  turbopack: {},
  // VERCEL_ENV(시스템 변수)는 기본적으로 클라이언트 번들에 노출되지 않는다.
  // instrumentation-client.ts에서 Sentry environment로 쓰기 위해 명시적으로 인라인한다.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV,
  },
  async redirects() {
    // 라우트 정비 (R1.1) — 12_ia-userflows §1.3 매핑표 기준
    return [
      // apex → www 정렬 — 정본 호스트는 www (389fc42 canonical/sitemap 정렬과 동일 기준)
      {
        source: "/:path*",
        has: [{ type: "host", value: "auditionpass.co.kr" }],
        destination: "https://www.auditionpass.co.kr/:path*",
        permanent: true,
      },
      // 지원 이력 1급 승격: /history → /applications (F6)
      {
        source: "/history",
        destination: "/applications",
        permanent: true,
      },
      // 과금 스텁 제거: 라이브 sitemap에 실려 있어 404가 아닌 301 (F11)
      {
        source: "/pricing",
        destination: "/",
        permanent: true,
      },
      // 준비 중 알림 스텁 제거 (F11)
      {
        source: "/my/notifications",
        destination: "/my",
        permanent: true,
      },
    ];
  },
};

// 에러 모니터링(Sentry). DSN 미설정 시 instrumentation.ts/instrumentation-client.ts에서
// 초기화 자체를 건너뛰므로 이 wrapper는 그대로 유지해도 안전하다.
// 소스맵 업로드는 SENTRY_AUTH_TOKEN이 있을 때만 시도되고, 없으면 경고만 남기고
// 빌드는 그대로 성공한다(@sentry/webpack-plugin의 기본 동작). Turbopack 빌드에서도
// `compiler.runAfterProductionCompile` 훅으로 소스맵을 업로드하므로 별도 웹팩 강제가 필요 없다.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  silent: true,
  telemetry: false,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
