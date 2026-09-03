import * as Sentry from "@sentry/nextjs";

/**
 * 서버·엣지 런타임 에러 모니터링(Sentry) 초기화.
 *
 * DSN(`SENTRY_DSN`)이 없으면 아무것도 하지 않는다 — 소유자가 아직 Sentry
 * 프로젝트를 만들지 않은 상태에서도 빌드·배포가 그대로 동작해야 한다.
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV,
    tracesSampleRate: 0.1,
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

export async function onRequestError(
  ...args: Parameters<typeof Sentry.captureRequestError>
) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureRequestError(...args);
}
