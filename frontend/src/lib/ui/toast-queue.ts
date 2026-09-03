/**
 * 토스트 큐 리듀서 — 순수 로직만 (F12 공용 토스트 시스템).
 * 렌더링·타이머는 components/ui/Toast.tsx가 담당하고, 여기는 "무엇이 보여야 하는가"만 결정한다.
 */

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

export type ToastAction =
  | { type: "add"; item: ToastItem }
  | { type: "remove"; id: string };

/** 동시에 쌓이는 토스트가 화면을 덮지 않도록 최근 N개만 보여준다. */
export const MAX_VISIBLE_TOASTS = 3;

export function toastReducer(items: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case "add":
      return [...items, action.item].slice(-MAX_VISIBLE_TOASTS);
    case "remove":
      return items.filter((item) => item.id !== action.id);
    default:
      return items;
  }
}
