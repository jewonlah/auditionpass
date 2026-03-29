"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCircle, AlertCircle, Play, Ticket } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface ApplyStatus {
  hasProfile: boolean;
  hasApplied: boolean;
  canApply: boolean;
  canWatchAd: boolean;
  plan: string;
  todayCount: number;
  adBonus: number;
  maxApplies: number;
  remaining: number;
}

interface ApplyButtonProps {
  auditionId: string;
  status: ApplyStatus;
  isLoggedIn: boolean;
  loading: boolean;
  onStatusChange: (status: Partial<ApplyStatus>) => void;
}

const MAX_AD_BONUS = 3;

export function ApplyButton({
  auditionId,
  status,
  isLoggedIn,
  loading,
  onStatusChange,
}: ApplyButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [showResult, setShowResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);

  async function handleApply() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    if (!status.hasProfile) {
      setShowResult({
        type: "error",
        message: "프로필을 먼저 등록해주세요.",
      });
      setTimeout(() => router.push("/profile"), 1500);
      return;
    }

    if (!status.canApply) {
      setShowLimitModal(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditionId }),
      });

      const data = await res.json();

      if (res.ok) {
        onStatusChange({
          hasApplied: true,
          todayCount: status.todayCount + 1,
          remaining: status.remaining - 1,
          canApply: status.remaining - 1 > 0,
        });
        setShowResult({
          type: "success",
          message: "지원이 완료되었습니다! 이메일이 발송되었습니다.",
        });
      } else if (data.code === "LIMIT_EXCEEDED") {
        onStatusChange({ canApply: false });
        setShowLimitModal(true);
      } else if (data.code === "NO_PROFILE") {
        setShowResult({
          type: "error",
          message: "프로필을 먼저 등록해주세요.",
        });
        setTimeout(() => router.push("/profile"), 1500);
      } else if (data.code === "ALREADY_APPLIED") {
        onStatusChange({ hasApplied: true });
      } else {
        setShowResult({
          type: "error",
          message: data.error || "지원에 실패했습니다. 다시 시도해주세요.",
        });
      }
    } catch {
      setShowResult({
        type: "error",
        message: "네트워크 오류가 발생했습니다. 다시 시도해주세요.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWatchAd() {
    setWatchingAd(true);

    // TODO: 실제 광고 SDK (Google AdSense 리워드 광고) 연동
    // 현재는 2초 대기로 시뮬레이션
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const res = await fetch("/api/apply/ad-bonus", {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        const newAdBonus = data.ad_bonus as number;
        const newMax = 1 + newAdBonus;
        onStatusChange({
          adBonus: newAdBonus,
          canApply: status.todayCount < newMax,
          canWatchAd: data.can_watch_more,
          maxApplies: newMax,
          remaining: Math.max(newMax - status.todayCount, 0),
        });
        setShowLimitModal(false);
        setShowResult({
          type: "success",
          message: `추가 지원권 획득! (광고 보너스 ${newAdBonus}/${MAX_AD_BONUS})`,
        });
      } else if (data.code === "AD_BONUS_MAX") {
        onStatusChange({ canWatchAd: false });
        setShowResult({
          type: "error",
          message: "오늘 광고 보너스를 모두 사용했습니다.",
        });
      } else {
        setShowResult({
          type: "error",
          message: data.error || "광고 보너스 지급에 실패했습니다.",
        });
      }
    } catch {
      setShowResult({
        type: "error",
        message: "네트워크 오류가 발생했습니다.",
      });
    } finally {
      setWatchingAd(false);
    }
  }

  // 로딩 중
  if (loading) {
    return <div className="h-12 animate-pulse rounded-lg bg-gray-200" />;
  }

  // 이미 지원 완료
  if (status.hasApplied) {
    return (
      <>
        <Button variant="outline" disabled className="w-full gap-2">
          <CheckCircle size={18} />
          지원 완료
        </Button>
        {showResult?.type === "success" && (
          <ResultToast
            result={showResult}
            onClose={() => setShowResult(null)}
          />
        )}
      </>
    );
  }

  // 남은 횟수 텍스트
  const remainingText =
    isLoggedIn && status.plan === "free"
      ? `오늘 ${status.remaining}/${status.maxApplies}회 남음`
      : null;

  return (
    <>
      <div>
        <Button
          variant="accent"
          size="lg"
          className="w-full gap-2"
          onClick={handleApply}
          disabled={submitting}
        >
          {submitting ? (
            "지원 중..."
          ) : !isLoggedIn ? (
            <>
              <Send size={18} />
              로그인하고 지원하기
            </>
          ) : (
            <>
              <Send size={18} />
              원클릭 지원
            </>
          )}
        </Button>
        {remainingText && (
          <p className="mt-1.5 text-center text-xs text-gray-400">
            <Ticket size={12} className="inline mr-1 -mt-0.5" />
            {remainingText}
          </p>
        )}
      </div>

      {/* 결과 토스트 */}
      {showResult && (
        <ResultToast result={showResult} onClose={() => setShowResult(null)} />
      )}

      {/* 횟수 초과 모달 */}
      <Modal
        open={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        title="지원 횟수 초과"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle size={28} className="text-amber-600" />
          </div>

          <p className="text-sm text-gray-600 mb-1">
            오늘 무료 지원 횟수를 모두 사용했습니다.
          </p>
          <p className="text-xs text-gray-400 mb-5">
            사용: {status.todayCount}회 / 최대: {status.maxApplies}회 (기본 1 +
            광고 {status.adBonus})
          </p>

          {status.canWatchAd ? (
            <>
              <p className="text-sm text-gray-500 mb-4">
                광고를 시청하면 추가 지원이 가능합니다.
                <br />
                <span className="text-xs text-gray-400">
                  (광고 보너스 {status.adBonus}/{MAX_AD_BONUS}회 사용)
                </span>
              </p>
              <div className="space-y-2">
                <Button
                  variant="accent"
                  className="w-full gap-2"
                  onClick={handleWatchAd}
                  disabled={watchingAd}
                >
                  {watchingAd ? (
                    "광고 시청 중..."
                  ) : (
                    <>
                      <Play size={16} />
                      광고 시청하고 지원권 받기
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={() => router.push("/pricing")}
                >
                  구독하고 무제한 지원하기
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                오늘 광고 보너스를 모두 사용했습니다.
                <br />
                (하루 최대 {MAX_AD_BONUS}회)
              </p>
              <div className="space-y-2">
                <Button
                  variant="accent"
                  className="w-full"
                  onClick={() => router.push("/pricing")}
                >
                  구독하고 무제한 지원하기
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={() => setShowLimitModal(false)}
                >
                  내일 다시 지원하기
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

function ResultToast({
  result,
  onClose,
}: {
  result: { type: "success" | "error"; message: string };
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 max-w-sm w-[calc(100%-2rem)] rounded-lg px-4 py-3 shadow-lg text-sm font-medium ${
        result.type === "success"
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {result.type === "success" ? (
            <CheckCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{result.message}</span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-current opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
