"use client";

// 공고 검색·긴급 조치 (R1b): 제목/이메일/출처 검색 → 게시중지·격리.
// 게시중지·격리는 모바일에서도 허용되는 긴급 조치 (39 §4). 승인은 여기 없음 — 검수 큐에서만.

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  title: string;
  source_name: string | null;
  deadline: string | null;
  apply_email: string | null;
  review_status: string;
  is_active: boolean;
  created_at: string;
};

const STATUS_FILTERS = [
  ["active", "활성"],
  ["all", "전체"],
  ["approved", "approved"],
  ["quarantine", "격리"],
  ["rejected", "rejected"],
] as const;

export function AuditionsClient() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const search = useCallback(async (query: string, st: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/auditions?q=${encodeURIComponent(query)}&status=${st}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "검색 실패");
      setRows(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    search("", "active");
  }, [search]);

  const act = async (row: Row, action: "unpublish" | "quarantine") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, auditionId: row.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "조치 실패");
      setMessage(
        `${action === "unpublish" ? "게시중지" : "격리"} 완료 — ${row.title}` +
          (data.logWarning ? ` (${data.logWarning})` : "")
      );
      await search(q, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조치 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-col gap-3.5 p-5 lg:p-7">
      <h1 className="text-[22px] font-extrabold tracking-tight">공고 검색 · 긴급 조치</h1>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(q, status)}
          placeholder="제목 · 지원 이메일 · 출처"
          className="min-w-60 flex-1 rounded-lg border border-[#E7E5E0] bg-white px-3.5 py-2.5 text-[14px]"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            search(q, e.target.value);
          }}
          className="rounded-lg border border-[#E7E5E0] bg-white px-2.5 py-2 text-[13px]"
        >
          {STATUS_FILTERS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={() => search(q, status)}
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-50"
        >
          검색
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#DC2626]">{error}</p>
      )}
      {message && (
        <p className="rounded-lg bg-[#ECFDF5] px-3.5 py-2.5 text-[13px] text-[#059669]">{message}</p>
      )}

      <section className="overflow-x-auto rounded-[10px] border border-[#E7E5E0] bg-white">
        {loading ? (
          <p className="px-4 py-5 text-[13px] text-[#8A8A86]">검색 중…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-[#8A8A86]">결과 없음</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#F0F0EE] text-left text-[11px] font-semibold tracking-wide text-[#8A8A86] uppercase">
                <th className="px-4 py-2.5">제목</th>
                <th className="px-3 py-2.5">출처</th>
                <th className="px-3 py-2.5">마감</th>
                <th className="px-3 py-2.5">상태</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#F0F0EE] last:border-b-0">
                  <td className="max-w-90 px-4 py-2">
                    <div className="line-clamp-1 font-semibold">{r.title}</div>
                    <div className="text-[11.5px] text-[#8A8A86]">{r.apply_email ?? "이메일 없음"}</div>
                  </td>
                  <td className="px-3 py-2 text-[#4A4A48]">{r.source_name?.split(":")[0]}</td>
                  <td className="px-3 py-2 tabular-nums text-[#4A4A48]">{r.deadline ?? "상시"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        r.is_active
                          ? "bg-[#ECFDF5] text-[#059669]"
                          : r.review_status === "quarantine"
                            ? "bg-[#FEF2F2] text-[#DC2626]"
                            : "bg-[#F3F4F6] text-[#6B7280]"
                      }`}
                    >
                      {r.is_active ? `게시 중 · ${r.review_status}` : r.review_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.is_active && (
                      <button
                        onClick={() => act(r, "unpublish")}
                        disabled={busy}
                        className="mr-2 text-[12px] font-bold text-[#B45309] disabled:opacity-50"
                      >
                        게시중지
                      </button>
                    )}
                    {r.review_status !== "quarantine" && (
                      <button
                        onClick={() => act(r, "quarantine")}
                        disabled={busy}
                        className="text-[12px] font-bold text-[#DC2626] disabled:opacity-50"
                      >
                        격리
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-[11.5px] text-[#8A8A86]">
        게시중지 = 노출 내림 + pending 재검토 대열(크롤러 재활성화 방지). 조치는 admin_actions에
        기록되며 검수 큐 우측 패널에서 되돌릴 수 있다. 승인은 검수 큐에서만.
      </p>
    </main>
  );
}
