"use client";

// suppression 긴급 차단 관리 (R1b): 목록 + 등록(사유 필수, 등록 즉시 sweep) + 해제.
// 해제해도 내려간 공고는 자동 재게시되지 않는다 — 공고 검색에서 수동 재검토.

import { useCallback, useEffect, useState } from "react";

type SuppressionRow = {
  id: number;
  kind: "email" | "domain" | "source";
  value: string;
  reason: string;
  created_by: string;
  created_at: string;
};

const KIND_LABEL = { email: "이메일", domain: "도메인", source: "소스" } as const;

export function SuppressionManager({ initialBlockValue }: { initialBlockValue: string }) {
  const [items, setItems] = useState<SuppressionRow[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [kind, setKind] = useState<"email" | "domain" | "source">(
    initialBlockValue ? "source" : "email"
  );
  const [value, setValue] = useState(initialBlockValue);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/suppression");
    const data = await res.json();
    if (!res.ok) {
      setUnavailable(true);
      setError(data.error);
      return;
    }
    setUnavailable(false);
    setItems(data.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/suppression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "차단 등록 실패");
      setMessage(`차단 등록 완료 — 활성 공고 ${data.sweptCount}건 즉시 게시중지됨`);
      setValue("");
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "차단 등록 실패");
    } finally {
      setBusy(false);
    }
  };

  // 해제는 인라인 2단계 확인 (한 번 더 클릭) — 내려간 공고는 자동 재게시되지 않음
  const remove = async (id: number) => {
    if (busy) return;
    if (confirmRemoveId !== id) {
      setConfirmRemoveId(id);
      return;
    }
    setConfirmRemoveId(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/suppression", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "해제 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "해제 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[10px] border border-[#E7E5E0] bg-white p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <b className="text-sm">suppression 긴급 차단</b>
        <span className="text-[11.5px] text-[#8A8A86]">
          등록 즉시 매칭 활성 공고 게시중지 · 공용 메일 도메인 차단 금지
        </span>
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#DC2626]">{error}</p>
      )}
      {message && (
        <p className="mb-2 rounded-lg bg-[#ECFDF5] px-3 py-2 text-[12.5px] text-[#059669]">{message}</p>
      )}
      {unavailable && (
        <p className="mb-2 text-[12.5px] text-[#B45309]">
          suppression 테이블 조회 불가 — 014 마이그레이션 라이브 적용 필요
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="rounded-lg border border-[#E7E5E0] px-2.5 py-2 text-[13px]"
        >
          <option value="email">이메일</option>
          <option value="domain">도메인</option>
          <option value="source">소스</option>
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "email" ? "spam@example.com" : kind === "domain" ? "example.com" : "출처명"}
          className="min-w-52 flex-1 rounded-lg border border-[#E7E5E0] px-3 py-2 text-[13px]"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="차단 사유 (필수)"
          className="min-w-52 flex-1 rounded-lg border border-[#E7E5E0] px-3 py-2 text-[13px]"
        />
        <button
          onClick={submit}
          disabled={busy || !value.trim() || !reason.trim()}
          className="rounded-lg bg-[#DC2626] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
        >
          긴급 차단
        </button>
      </div>

      {items.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {items.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-baseline gap-2 border-t border-[#F0F0EE] pt-1.5 text-[12.5px]"
            >
              <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10.5px] font-bold text-[#DC2626]">
                {KIND_LABEL[s.kind]}
              </span>
              <b>{s.value}</b>
              <span className="text-[#8A8A86]">
                {s.reason} · {s.created_at.slice(0, 10)}
              </span>
              <button
                onClick={() => remove(s.id)}
                className={`ml-auto text-[12px] underline ${
                  confirmRemoveId === s.id ? "font-bold text-[#DC2626]" : "text-[#8A8A86]"
                }`}
                disabled={busy}
              >
                {confirmRemoveId === s.id ? "정말 해제? (재게시는 수동)" : "해제"}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
