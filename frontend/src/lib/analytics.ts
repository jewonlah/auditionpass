/**
 * GA4 커스텀 이벤트 헬퍼 (11_prd F4 §7 측정 계획 — 온보딩 진입·스텝 완료·스킵 계측).
 *
 * `app/layout.tsx`의 gtag.js는 `afterInteractive`로 로드되어, 마운트 즉시 발사되는
 * 이벤트(`AuditionActions`의 `audition_view` 등)는 `window.gtag`가 아직 없을 수 있다.
 * 표준 gtag 스텁(`function(){dataLayer.push(arguments)}`)과 동일하게 `dataLayer`에
 * arguments 형태로 직접 push해 유실을 막는다. `NEXT_PUBLIC_GA_ID`가 없으면(로컬·프리뷰)
 * `dataLayer`도 없으므로 여전히 no-op.
 */
type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

/**
 * google 표준 gtag 스텁(`function(){dataLayer.push(arguments)}`)과 동일하게
 * 인자 목록 전체를 하나의 항목으로 push한다(GA는 이를 arguments-like로 순회).
 */
function pushToDataLayer(...args: unknown[]): void {
  window.dataLayer?.push(args);
}

export function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params ?? {});
    return;
  }
  if (Array.isArray(window.dataLayer)) {
    pushToDataLayer("event", event, params ?? {});
  }
}
