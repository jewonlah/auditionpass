"use client";

// 공고 신고 (36 §4) — 사유 10종 선택 + 선택 설명. 심각 사유는 접수 즉시 원클릭이 차단된다.
// 비로그인 시 로그인으로 유도(returnTo 유지), 중복 신고는 서버가 막는다.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { REPORT_REASONS } from "@/lib/reports";
import { withReturnTo } from "@/lib/utils";

type Result = { kind: "done"; severe: boolean } | { kind: "error"; message: string } | null;

export function ReportButton({
  auditionId,
  isLoggedIn,
}: {
  auditionId: string;
  isLoggedIn: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);

  const close = () => {
    setOpen(false);
    setReason(null);
    setDetail("");
    setResult(null);
  };

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditionId, reason, detail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ kind: "error", message: data.error || "신고 접수에 실패했습니다." });
        return;
      }
      setResult({ kind: "done", severe: data.severity === "severe" });
    } catch {
      setResult({ kind: "error", message: "네트워크 오류가 발생했습니다." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 py-3 text-[13px] font-medium text-gray-400 transition-colors hover:text-gray-600"
      >
        <Flag size={14} />
        이 공고 신고하기
      </button>

      <Modal open={open} onClose={close} title="공고 신고">
        {result?.kind === "done" ? (
          <div className="text-center">
            <ShieldAlert size={32} className="mx-auto mb-3 text-primary" />
            <p className="text-[15px] font-bold text-gray-900">신고가 접수되었습니다</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              {result.severe
                ? "안전을 위해 이 공고의 원클릭 지원을 즉시 중지했습니다. 24시간 안에 확인하고 결과를 반영합니다."
                : "확인 후 처리 결과를 공고에 반영합니다. 보통 3일 안에 검토됩니다."}
            </p>
            <button
              onClick={close}
              className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white"
            >
              확인
            </button>
          </div>
        ) : !isLoggedIn ? (
          <div>
            <p className="text-sm leading-relaxed text-gray-600">
              장난 신고를 막기 위해 로그인 후 신고할 수 있습니다. 급한 위험 신고는 로그인 뒤 바로
              접수됩니다.
            </p>
            <Link
              href={withReturnTo("/login", pathname)}
              className="mt-5 block w-full rounded-xl bg-primary py-3 text-center text-sm font-bold text-white"
            >
              로그인하고 신고하기
            </Link>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-gray-500">
              어떤 문제인가요? 가장 가까운 사유 하나를 골라 주세요.
            </p>
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.code}
                  onClick={() => setReason(r.code)}
                  className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    reason === r.code
                      ? "border-primary bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="block text-sm font-semibold text-gray-900">{r.label}</span>
                  {r.hint && <span className="block text-xs text-gray-400">{r.hint}</span>}
                </button>
              ))}
            </div>

            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="자세한 내용 (선택)"
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />

            {result?.kind === "error" && (
              <p className="mt-2 text-sm font-medium text-red-600">{result.message}</p>
            )}

            <button
              onClick={submit}
              disabled={!reason || submitting}
              className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {submitting ? "접수 중…" : "신고 접수"}
            </button>
            <p className="mt-2 text-center text-xs text-gray-400">
              접수된 신고는 운영자가 직접 확인합니다.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
