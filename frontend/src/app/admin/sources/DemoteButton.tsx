"use client";

// 출처 강등 (36 §5) — 신뢰 해제. 사유 입력을 받고 인라인 2단계로 확인한다.
// 강등해도 이미 게재된 공고는 내려가지 않는다(그건 게시중지·suppression의 몫).

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DemoteButton({
  source,
  reasons,
}: {
  source: string;
  reasons: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trust", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "강등 실패");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "강등 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-[#FFFBEB] px-2 py-1 text-[11.5px] font-bold text-[#B45309]"
      >
        강등 후보
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E7E5E0] bg-white p-5 text-left shadow-lg">
            <h3 className="text-[15px] font-extrabold">출처 신뢰 해제 — {source}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#4A4A48]">
              최근 30일 기준 초과: <b className="text-[#B45309]">{reasons.join(" · ")}</b>
              <br />
              해제하면 이 출처의 <b>신규 공고가 자동 게재 대신 검수 대기</b>로 들어갑니다.
              <br />
              <span className="text-[11.5px] text-[#8A8A86]">
                이미 게재된 공고는 내려가지 않습니다. 내리려면 긴급 차단이나 개별 게시중지를
                쓰세요. 다시 신뢰 출처로 올리는 건 별도 절차입니다.
              </span>
            </p>

            {error && (
              <p className="mt-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#DC2626]">
                {error}
              </p>
            )}

            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="강등 사유 (필수)"
              className="mt-3 w-full rounded-lg border border-[#E7E5E0] px-3 py-2.5 text-[13.5px]"
              autoFocus
            />

            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[#E7E5E0] px-4 py-2 text-[13.5px] font-semibold"
              >
                취소
              </button>
              <button
                onClick={submit}
                disabled={busy || !reason.trim()}
                className="rounded-lg bg-[#B45309] px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-40"
              >
                신뢰 해제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
