"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 스크롤 진입 리빌.
 *
 * GSAP·Lenis 를 쓰지 않는다. 이 페이지는 검색·AI 색인이 목적이라 번들과 Core Web Vitals 가
 * 미감보다 우선한다. 시네마틱한 인상은 타이포·명암·타이밍으로 만들고, 모션은
 * transform·opacity·filter 만 건드려 레이아웃 재계산을 일으키지 않는다.
 *
 * scroll 이벤트 대신 IntersectionObserver — 연속 리플로우로 모바일 프레임이 떨어진다.
 * prefers-reduced-motion 이면 즉시 표시한다.
 */

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // 이펙트 본문에서 곧바로 setState 하면 연쇄 렌더가 난다(react-hooks/set-state-in-effect).
      // 다음 프레임으로 미룬다 — 사용자 눈에는 동일하게 '즉시 표시'다.
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect(); // 한 번만 — 되감기는 산만하다
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, shown } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-[opacity,transform,filter] duration-[1000ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-10 opacity-0 blur-[8px]"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * 헤드라인 전용 — 줄 단위로 마스크 뒤에서 올라온다.
 * 텍스트는 서버 HTML 에 그대로 있으므로 JS 가 없거나 크롤러가 읽어도 내용은 온전하다.
 */
export function RevealLines({
  lines,
  className = "",
  lineClassName = "",
}: {
  lines: string[];
  className?: string;
  lineClassName?: string;
}) {
  const { ref, shown } = useInView<HTMLHeadingElement>();
  return (
    <h1 ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={line} className="block overflow-hidden">
          <span
            style={{ transitionDelay: shown ? `${i * 110}ms` : "0ms" }}
            className={`block transition-[transform,opacity] duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
              shown ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
            } ${lineClassName}`}
          >
            {line}
          </span>
        </span>
      ))}
    </h1>
  );
}
