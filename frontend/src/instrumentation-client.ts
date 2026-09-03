import * as Sentry from "@sentry/nextjs";

/**
 * 클라이언트 에러 모니터링(Sentry) 초기화.
 *
 * DSN(`NEXT_PUBLIC_SENTRY_DSN`)이 없으면 아무것도 하지 않는다 — 소유자가 아직
 * Sentry 프로젝트를 만들지 않은 상태에서도 빌드·배포가 그대로 동작해야 한다.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    // 개인정보(이메일 등)가 이벤트에 실려 나가지 않도록 방어.
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

/**
 * PWA 서비스워커 등록.
 *
 * 프로덕션에서만 등록한다 — 개발 모드에서 오래된 캐시가 HMR/최신 코드를 가리는
 * 사고를 막는다(next-pwa 시절부터 지켜온 규칙, CLAUDE.frontend.md §PWA).
 * `public/sw.js`는 정적 자산(폰트·아이콘·`_next/static`)만 캐시하고,
 * `/api/*`·`/admin/*`·`/auth/*`·HTML 문서는 항상 네트워크로 보낸다.
 */
if (
  typeof window !== "undefined" &&
  process.env.NODE_ENV === "production" &&
  "serviceWorker" in navigator
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 서비스워커 등록 실패가 앱 사용을 막아서는 안 된다 — 조용히 무시.
    });
  });
}
