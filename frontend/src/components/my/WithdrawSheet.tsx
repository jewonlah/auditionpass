"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

/** 오타로 인한 우발적 탈퇴를 막는 확인 문구 */
const CONFIRM_WORD = "탈퇴";

/**
 * 회원 탈퇴 확인 시트 (MY > 회원 탈퇴).
 *
 * 되돌릴 수 없는 조작이라 두 겹으로 막는다: 시트 열기 + "탈퇴" 직접 입력.
 * 네이티브 confirm/alert 은 쓰지 않는다(23_design-system — 시스템 대화상자 금지).
 */
export function WithdrawSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [word, setWord] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = word.trim() === CONFIRM_WORD && !submitting;

  function handleClose() {
    if (submitting) return; // 진행 중 닫기 금지 — 부분 삭제 상태를 사용자가 모르게 된다
    setWord("");
    setError("");
    onClose();
  }

  async function handleWithdraw() {
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
        setSubmitting(false);
        return;
      }
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setSubmitting(false);
      return;
    }

    // 계정이 이미 사라졌으므로 로컬 세션도 반드시 정리한다.
    // signOut 이 서버 호출에 실패해도(토큰 무효) 홈으로 보내는 것은 계속한다.
    try {
      await supabase.auth.signOut();
    } catch {
      // 무시 — 계정은 이미 삭제됨
    }

    // router.push 가 아니라 하드 이동. 클라이언트에 남은 인증 상태·캐시를 통째로 버린다.
    window.location.assign("/");
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="정말 탈퇴하시겠어요?">
      <div className="space-y-4 pb-2">
        <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <div className="text-sm text-red-700">
            <p className="font-semibold">되돌릴 수 없습니다.</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed">
              <li>프로필 정보와 등록하신 사진이 모두 삭제됩니다</li>
              <li>지원 이력과 찜 목록이 삭제됩니다</li>
              <li>작성하신 커뮤니티 글과 댓글이 더 이상 보이지 않습니다</li>
              <li>같은 이메일로 다시 가입해도 이전 기록은 복구되지 않습니다</li>
            </ul>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          계속하시려면 아래에 <span className="font-semibold text-gray-900">{CONFIRM_WORD}</span>
          {" "}를 입력해주세요.
        </p>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600" role="alert">
            {error}
          </div>
        )}

        <Input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder={CONFIRM_WORD}
          autoComplete="off"
          aria-label={`확인 문구 ${CONFIRM_WORD} 입력`}
          disabled={submitting}
        />

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={handleClose}
            disabled={submitting}
          >
            취소
          </Button>
          <Button
            type="button"
            size="lg"
            className="flex-1 bg-red-500 text-white hover:bg-red-600 focus:ring-red-400"
            onClick={handleWithdraw}
            disabled={!canSubmit}
          >
            {submitting ? "처리 중..." : "탈퇴하기"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
