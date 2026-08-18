"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** 스와이프가 이 거리(px)를 넘으면 닫기 */
const SWIPE_CLOSE_THRESHOLD = 80;
/** 닫힘 애니메이션 시간 — CSS transition과 일치 필수 */
const CLOSE_DURATION_MS = 400;

/**
 * 공용 바텀시트 (F5 지원 게이트 · F7 필터 공유)
 * - grabber 핸들, 스와이프 다운 닫기, 안드로이드 뒤로가기(popstate) 닫기
 * - 스프링 모션 cubic-bezier(0.32,0.72,0,1) 400ms / 딤 250ms (20_design-language)
 * - prefers-reduced-motion 시 전환 시간 0
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [render, setRender] = useState(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  // 열림 시 즉시 마운트 — 렌더 단계 상태 조정 패턴 (effect 내 동기 setState 회피)
  if (open && !render) setRender(true);

  // 열림/닫힘 전환 — visible은 transition 트리거용으로 한 프레임 뒤 세팅
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setVisible(open);
      if (!open) setDragY(0);
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // 안드로이드 뒤로가기: 열릴 때 더미 히스토리 엔트리 push, popstate면 시트만 닫기
  useEffect(() => {
    if (!open) return;

    let popped = false;
    window.history.pushState(
      { ...window.history.state, bottomSheet: true },
      ""
    );

    function handlePopstate() {
      popped = true;
      onClose();
    }

    window.addEventListener("popstate", handlePopstate);
    return () => {
      window.removeEventListener("popstate", handlePopstate);
      // 프로그램적 닫기(스와이프·딤·CTA): 우리가 넣은 엔트리가 아직 최상단일 때만
      // 제거한다 — 시트에서 바로 router.push한 경우 새 엔트리를 되돌리지 않도록.
      if (!popped && window.history.state?.bottomSheet) {
        window.history.back();
      }
    };
  }, [open, onClose]);

  // 열려 있는 동안 바디 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // 시트 내부 스크롤 영역이 최상단일 때만 드래그 시작
    const scroller = sheetRef.current?.querySelector("[data-sheet-scroll]");
    if (scroller && scroller.scrollTop > 0) return;
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, delta));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    if (dragY > SWIPE_CLOSE_THRESHOLD) {
      onClose();
    } else {
      setDragY(0);
    }
  }, [dragY, onClose]);

  // 닫힘 시 퇴장 애니메이션 후 언마운트
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setRender(false), CLOSE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (typeof document === "undefined" || !render) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* 딤 */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity duration-250 motion-reduce:transition-none",
          visible && dragY === 0 ? "opacity-100" : "opacity-0",
          visible && dragY > 0 && "opacity-60"
        )}
        onClick={onClose}
      />

      {/* 시트 */}
      <div
        ref={sheetRef}
        className={cn(
          // 가로 센터링은 인라인 transform(translate(-50%, …))이 담당 — translate-x 유틸과 중복 금지
          "absolute bottom-0 left-1/2 w-full max-w-md rounded-t-[20px] bg-white",
          "pb-[max(env(safe-area-inset-bottom),16px)]",
          "transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          className
        )}
        style={{
          transform: visible
            ? `translate(-50%, ${dragY}px)`
            : "translate(-50%, 100%)",
          transitionDuration: dragY > 0 ? "0ms" : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* grabber 핸들 (36×5) */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-[5px] w-9 rounded-full bg-gray-300" />
        </div>

        {title && (
          <h2 className="px-5 pt-2 pb-1 text-lg font-bold text-gray-900">
            {title}
          </h2>
        )}

        <div
          data-sheet-scroll
          className="max-h-[70vh] overflow-y-auto overscroll-contain px-5 pt-2"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
