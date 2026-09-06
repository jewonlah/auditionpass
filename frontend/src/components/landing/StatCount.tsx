"use client";

import { useEffect, useRef, useState } from "react";

const nf = new Intl.NumberFormat("ko-KR");

/**
 * 히어로 통계 카운트업.
 *
 * 서버 HTML 에는 항상 최종값이 그대로 텍스트로 박힌다(크롤러·SEO 가 읽는 숫자라
 * JS 없이도 정확해야 한다). JS 가 붙고 화면에 들어온 뒤에만 0 에서 최종값으로
 * 굴러 올라가는 연출을 얹는다 — CSS `@property`+`counter()` 는 실제 텍스트가
 * `::after` 생성 콘텐츠에만 있어 SSR HTML 검증(육안·curl)을 통과 못 해 제외했다.
 */
export function StatCount({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const duration = 900;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - (1 - p) ** 3;
          setDisplay(Math.round(value * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return <span ref={ref}>{nf.format(display)}</span>;
}
