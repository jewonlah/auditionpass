/**
 * GA4 커스텀 이벤트 헬퍼 (11_prd F4 §7 측정 계획 — 온보딩 진입·스텝 완료·스킵 계측).
 *
 * `app/layout.tsx`는 `NEXT_PUBLIC_GA_ID`가 있는 프로덕션에서만 gtag.js를 로드한다.
 * 로컬·프리뷰에는 `window.gtag`가 없으므로 조용히 무시하고, 다른 화면에는 붙이지 않는다
 * (요청 범위 — 온보딩 3개 이벤트 전용).
 */
type GtagFn = (...args: unknown[]) => void;

export function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const gtag = (window as typeof window & { gtag?: GtagFn }).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", event, params ?? {});
}
