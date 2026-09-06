import type { CSSProperties, ReactNode } from "react";

/**
 * 스크롤 진입 리빌 — `animation-timeline: view()` 전용, JS 없음.
 *
 * 이전 버전은 IntersectionObserver 로 `shown` 을 뒤집었는데, 발화 전 숨김 클래스
 * (`opacity-0` 등)가 SSR HTML 에 그대로 나갔다. JS 가 늦거나 막히면 랜딩 본문이 영구히
 * 안 보이는 사고였다(라이브 실측 `opacity-0` 25건).
 *
 * 지금은 숨김 상태 자체를 `@supports (animation-timeline: view())` 블록 안에서만
 * 정의한다(CSS 는 `page.tsx` 의 인라인 `<style>` — 랜딩 전용이라 그 파일 주석 참고).
 * 미지원 브라우저·JS 없음·`prefers-reduced-motion: reduce` 면 그 블록이 통째로
 * 무시되어 기본값(보임)이 그대로 유지된다. GSAP·Lenis 를 쓰지 않는 이유도 같다 — 이
 * 페이지는 검색·AI 색인이 목적이라 번들과 Core Web Vitals 가 미감보다 우선한다.
 *
 * `delay` 는 더 이상 시간이 아니라 `--ap-reveal-shift`(px) 로 넘어가 스크롤 타임라인의
 * `animation-range` 시작점을 늦춘다 — 한 줄에 있는 여러 요소가 스크롤에 따라 순서대로
 * 나타나는 스태거를 만든다.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      style={{ "--ap-reveal-shift": `${delay}px` } as CSSProperties}
      className={`ap-reveal ${className}`}
    >
      {children}
    </div>
  );
}
