import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  async redirects() {
    // 라우트 정비 (R1.1) — 12_ia-userflows §1.3 매핑표 기준
    return [
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

export default nextConfig;
