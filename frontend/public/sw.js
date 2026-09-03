/**
 * 오디션패스 서비스워커 — 정적 자산 전용 캐시.
 *
 * next-pwa(2022-08 이후 미유지보수)와 @serwist/next는 둘 다 next.config의
 * webpack() 훅에 의존하는데, Next 16은 Turbopack이 기본 번들러라서
 * webpack() 설정이 아예 호출되지 않는다(@serwist/next는 Turbopack 빌드에서
 * 명시적으로 미지원을 경고한다 — 실험 단계인 @serwist/turbopack만 대안).
 * 캐시 정책이 "정적 자산만" 수준으로 단순해 별도 빌드 도구 없이
 * 손으로 작성한 서비스워커가 가장 신뢰할 수 있는 선택이다.
 *
 * 정책:
 *  - `_next/static/*`, `/icons/*`, `/fonts/*`, 폰트 확장자 → cache-first
 *  - `/api/*`, `/admin/*`, `/auth/*`, HTML 문서(내비게이션) → 네트워크만
 *    (오래된 캐시로 공고 목록·인증 상태가 보이면 안 된다)
 *  - 그 외 요청은 가로채지 않는다(기본 네트워크 동작)
 *
 * 등록은 `src/instrumentation-client.ts`에서 프로덕션에만 수행한다.
 */

const CACHE_NAME = "auditionpass-static-v1";

const STATIC_PATH_PATTERNS = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /^\/fonts\//,
  /\.(?:woff2?|ttf|otf|eot)$/,
];

const NETWORK_ONLY_PATTERNS = [/^\/api\//, /^\/admin\//, /^\/auth\//];

function isStaticAsset(pathname) {
  return STATIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

function isNetworkOnly(pathname) {
  return NETWORK_ONLY_PATTERNS.some((re) => re.test(pathname));
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET만 다룬다. POST 등은 항상 네트워크로.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 다른 오리진(외부 API·CDN 등)은 손대지 않는다.
  if (url.origin !== self.location.origin) return;

  // API·어드민·인증 라우트는 절대 캐시하지 않는다.
  if (isNetworkOnly(url.pathname)) return;

  // HTML 문서(페이지 내비게이션)는 항상 네트워크에서 최신 상태로 받는다.
  if (request.mode === "navigate" || request.destination === "document") {
    return;
  }

  if (!isStaticAsset(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        if (cached) return cached;
        throw err;
      }
    })
  );
});
