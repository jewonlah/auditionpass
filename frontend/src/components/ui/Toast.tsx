"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastReducer, type ToastAction, type ToastItem, type ToastKind } from "@/lib/ui/toast-queue";

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** 자동 소멸 시간 (23_design-system §2.9 — 3초, 접근성 체크리스트상 액션 있으면 6초) */
const AUTO_DISMISS_MS = 3000;

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ICON_COLOR: Record<ToastKind, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
  info: "text-gray-300",
};

/**
 * 공용 토스트 시스템 (11_prd F12 — ApplyButton 내장 ResultToast·커뮤니티 토스트 대체).
 * 하단 고정, 3초 자동 소멸, `role="status"` + `aria-live="polite"`.
 * `app/(main)/layout.tsx` · `app/admin/layout.tsx` · `app/(auth)/layout.tsx`에 마운트한다.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dispatch = useCallback((action: ToastAction) => {
    setItems((prev) => toastReducer(prev, action));
  }, []);

  const remove = useCallback(
    (id: string) => {
      dispatch({ type: "remove", id });
      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    },
    [dispatch]
  );

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      dispatch({ type: "add", item: { id, kind, message } });
      const timer = setTimeout(() => remove(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dispatch, remove]
  );

  // 언마운트 시 타이머 정리
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const api: ToastApi = {
    success: (message) => push("success", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom)+12px)] z-[60] flex flex-col items-center gap-2 px-4"
            aria-live="polite"
          >
            {items.map((item) => (
              <ToastBubble key={item.id} item={item} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

function ToastBubble({ item }: { item: ToastItem }) {
  const [visible, setVisible] = useState(false);
  const Icon = ICONS[item.kind];

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-[calc(28rem-2rem)] items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-[14px] text-white shadow-lg",
        "transition-all duration-200 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <Icon size={16} className={cn("shrink-0", ICON_COLOR[item.kind])} aria-hidden />
      <span className="leading-snug">{item.message}</span>
    </div>
  );
}

/** `toast.success/error/info(message)` — ToastProvider 하위에서만 사용 가능 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast는 ToastProvider 내부에서만 사용할 수 있습니다.");
  }
  return ctx;
}
