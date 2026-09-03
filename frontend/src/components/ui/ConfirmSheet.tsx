"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 파괴적 행동(삭제·거부 등)이면 확인 버튼을 위험 색으로 */
  danger?: boolean;
  /** 처리 중에는 닫기·재클릭을 막는다 */
  submitting?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 범용 확인 바텀시트 (11_prd F12 — native `confirm()` 전폐).
 *
 * "예/아니오"형 단순 확인 전용. 회원 탈퇴처럼 확인 문구를 직접 입력받아야 하는
 * 경우는 `components/my/WithdrawSheet.tsx`가 별도 패턴을 유지한다.
 */
export function ConfirmSheet({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  submitting = false,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  function handleClose() {
    if (submitting) return; // 처리 중 닫기 금지 — 결과를 사용자가 모르게 된다
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={title}>
      <div className="space-y-4 pb-2">
        {description && <p className="text-sm text-gray-500">{description}</p>}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={handleClose}
            disabled={submitting}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="lg"
            className={cn(
              "flex-1",
              danger && "bg-red-500 text-white hover:bg-red-600 focus:ring-red-400"
            )}
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? "처리 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
