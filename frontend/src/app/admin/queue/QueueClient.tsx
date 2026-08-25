"use client";

// 검수 큐 (39 §2) — 카드 검수 + 승인 게이트 3단 + 키보드 + 5초 undo.
// 게이트 판정은 서버가 강제하고, 이 UI는 그 결과를 표시·안내만 한다.
// 키: 1 승인(SAFE 즉시, CHECK는 사유 확인) · 2 거절 · 4 격리 · 5 원문 · s 스킵 · u 되돌리기
// 3 병합 · o 원클릭은 R1b/M2 — 비활성 표기만.

import { useCallback, useEffect, useRef, useState } from "react";

type Gate = {
  decision: "SAFE" | "CHECK" | "BLOCKED";
  blockedReasons: string[];
  checkReasons: string[];
  risk: { score: number; reasons: string[]; minor: boolean };
  trusted: boolean;
  dedup: { id: string; title: string; review_status: string; deadline: string | null }[];
};

type Item = {
  id: string;
  title: string;
  company: string | null;
  category: string | null;
  deadline: string | null;
  apply_email: string | null;
  description: string | null;
  requirements: string | null;
  source_url: string | null;
  source_name: string | null;
  quality_score: number | null;
  created_at: string;
  gate: Gate;
};

type LogEntry = {
  id: number;
  action: string;
  audition_id: string | null;
  audition_title: string | null;
  undone_by: number | null;
  created_at: string;
};

const ACTION_LABEL: Record<string, string> = {
  approve: "승인",
  reject: "거절",
  quarantine: "격리",
  undo: "되돌림",
};

function dday(deadline: string | null): string {
  if (!deadline) return "상시";
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const diff = Math.round(
    (new Date(deadline).getTime() - new Date(today).getTime()) / 86400000
  );
  return diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : `마감+${-diff}`;
}

const BADGE_STYLE: Record<Gate["decision"], string> = {
  SAFE: "bg-[#ECFDF5] text-[#059669]",
  CHECK: "bg-[#FFFBEB] text-[#B45309]",
  BLOCKED: "bg-[#FEF2F2] text-[#DC2626]",
};

export function QueueClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [recent, setRecent] = useState<LogEntry[]>([]);
  const [logUnavailable, setLogUnavailable] = useState(false);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReasons, setConfirmReasons] = useState<string[] | null>(null);
  const [toast, setToast] = useState<{ actionId: number | null; label: string } | null>(null);
  const [processed, setProcessed] = useState(0);
  const [bulk, setBulk] = useState<{ open: boolean; input: string; error: string | null }>({
    open: false,
    input: "",
    error: null,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/queue");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "큐 조회 실패");
      setItems(data.items);
      setRecent(data.recent);
      setLogUnavailable(data.logUnavailable);
      setIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "큐 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = items[idx] ?? null;

  const showToast = (actionId: number | null, label: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ actionId, label });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const act = useCallback(
    async (action: "approve" | "reject" | "quarantine", confirmed = false) => {
      if (!current || busy) return;
      // SAFE만 1키 즉시 — CHECK는 사유 패널로 포커스 (39 §2)
      if (action === "approve" && current.gate.decision === "BLOCKED") return;
      if (action === "approve" && current.gate.decision === "CHECK" && !confirmed) {
        setConfirmReasons(current.gate.checkReasons);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, auditionId: current.id, confirmed }),
        });
        const data = await res.json();
        if (res.status === 409 && data.requiresConfirm) {
          setConfirmReasons(data.reasons);
          return;
        }
        if (!res.ok) throw new Error(data.error || "액션 실패");
        setConfirmReasons(null);
        setItems((prev) => prev.filter((it) => it.id !== current.id));
        setIdx((prev) => Math.min(prev, Math.max(0, items.length - 2)));
        setProcessed((p) => p + 1);
        if (data.actionId) {
          setRecent((prev) => [
            {
              id: data.actionId,
              action,
              audition_id: current.id,
              audition_title: current.title,
              undone_by: null,
              created_at: new Date().toISOString(),
            },
            ...prev,
          ]);
        }
        if (data.logWarning) setError(data.logWarning);
        showToast(data.actionId, `${ACTION_LABEL[action]} — ${current.title}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "액션 실패");
      } finally {
        setBusy(false);
      }
    },
    [current, busy, items.length]
  );

  const undo = useCallback(
    async (actionId: number) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "undo", actionId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "되돌리기 실패");
        setToast(null);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "되돌리기 실패");
      } finally {
        setBusy(false);
      }
    },
    [busy, load]
  );

  // 키보드 (데스크톱 전용 검수)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (bulk.open) return;
      switch (e.key) {
        case "1":
          act("approve");
          break;
        case "2":
          act("reject");
          break;
        case "4":
          act("quarantine");
          break;
        case "5":
          if (current?.source_url) window.open(current.source_url, "_blank", "noopener");
          break;
        case "s":
          setConfirmReasons(null);
          setIdx((p) => (items.length ? (p + 1) % items.length : 0));
          break;
        case "u": {
          const last = recent.find((r) => r.action !== "undo" && !r.undone_by);
          if (last) undo(last.id);
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, undo, current, items.length, recent, bulk.open]);

  const safeCount = items.filter((i) => i.gate.decision === "SAFE").length;

  // 일괄 승인 (39 §3): 현재 카드의 출처 기준 SAFE 후보만 — 조건은 서버가 재검증·강제
  const bulkSource = current?.source_name ?? null;
  const bulkTargets = bulkSource
    ? items.filter((i) => i.source_name === bulkSource && i.gate.decision === "SAFE").length
    : 0;
  const bulkExcluded = bulkSource
    ? items.filter((i) => i.source_name === bulkSource).length - bulkTargets
    : 0;

  const submitBulk = async () => {
    if (!bulkSource || busy) return;
    const expected = parseInt(bulk.input, 10);
    if (Number.isNaN(expected)) {
      setBulk((b) => ({ ...b, error: "승인할 건수를 숫자로 입력하세요." }));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: bulkSource, expectedCount: expected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulk((b) => ({ ...b, error: data.error || "일괄 승인 실패" }));
        return;
      }
      setBulk({ open: false, input: "", error: null });
      setProcessed((p) => p + data.approvedCount);
      showToast(null, `일괄 승인 ${data.approvedCount}건 — ${bulkSource}`);
      await load();
    } catch (e) {
      setBulk((b) => ({ ...b, error: e instanceof Error ? e.message : "일괄 승인 실패" }));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="p-8 text-sm text-[#8A8A86]">검수 큐 불러오는 중…</p>;
  }

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* 좌: 큐 리스트 */}
      <aside className="flex w-full shrink-0 flex-col border-b border-[#E7E5E0] bg-white lg:h-full lg:w-[300px] lg:border-r lg:border-b-0">
        <div className="px-4 pt-4 pb-2.5">
          <div className="text-base font-extrabold tracking-tight">
            검수 큐 <span className="font-semibold text-[#8A8A86] tabular-nums">{items.length}</span>
          </div>
          <div className="mt-2 flex gap-1.5 text-[11px] font-bold">
            <span className="rounded-full bg-[#141414] px-2.5 py-1 text-[#FAFAF7]">
              빠른 레인 {safeCount}
            </span>
            <span className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[#4A4A48]">
              수동 레인 {items.length - safeCount}
            </span>
          </div>
        </div>
        <div className="max-h-56 flex-1 overflow-y-auto lg:max-h-none">
          {items.map((it, i) => (
            <button
              key={it.id}
              onClick={() => {
                setConfirmReasons(null);
                setIdx(i);
              }}
              className={`block w-full border-b border-[#F0F0EE] px-3.5 py-2.5 text-left text-[12.5px] ${
                i === idx ? "border-l-[3px] border-l-primary bg-[#EEF2FF] pl-[11px]" : ""
              }`}
            >
              <b className="line-clamp-1">{it.title}</b>
              <span className="text-[#8A8A86]">
                {it.source_name?.split(":")[0]} · {dday(it.deadline)} ·{" "}
              </span>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-bold ${BADGE_STYLE[it.gate.decision]}`}
              >
                {it.gate.decision}
              </span>
            </button>
          ))}
          {items.length === 0 && (
            <p className="px-4 py-6 text-[13px] text-[#8A8A86]">검수할 pending 공고가 없습니다.</p>
          )}
        </div>
        <div className="hidden border-t border-[#F0F0EE] px-4 py-2.5 text-[11.5px] lg:block">
          {bulkSource && bulkTargets > 0 ? (
            <button
              onClick={() => setBulk({ open: true, input: "", error: null })}
              className="font-bold text-primary"
            >
              이 출처의 SAFE 후보 일괄 승인 ({bulkTargets}건)
            </button>
          ) : (
            <span className="text-[#8A8A86]">일괄: 현재 출처에 SAFE 후보 없음</span>
          )}
          <br />
          <span className="text-[10.5px] text-[#8A8A86]">(원클릭·trust 승격 제외 · 건수 입력 확인)</span>
        </div>
      </aside>

      {/* 중: 검수 카드 */}
      <main className="min-w-0 flex-1 p-4 lg:overflow-y-auto lg:p-6">
        {error && (
          <div className="mb-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5 text-[13px] text-[#DC2626]">
            {error}
          </div>
        )}
        {!current ? (
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-10 text-center text-sm text-[#8A8A86]">
            큐가 비었습니다. 오늘 처리 {processed}건.
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-xl border border-[#E7E5E0] bg-white shadow-sm">
            {/* 결정 배지 + 위험 (상단 고정, 접지 않음) */}
            <div
              className={`flex flex-wrap items-center gap-2.5 border-b border-[#F0F0EE] px-5 py-3.5 ${
                current.gate.decision === "SAFE"
                  ? "bg-[#F7FBF8]"
                  : current.gate.decision === "CHECK"
                    ? "bg-[#FFFDF5]"
                    : "bg-[#FEF7F7]"
              }`}
            >
              <span
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${
                  current.gate.decision === "SAFE"
                    ? "bg-[#10B981] text-white"
                    : current.gate.decision === "CHECK"
                      ? "bg-[#F59E0B] text-white"
                      : "bg-[#DC2626] text-white"
                }`}
              >
                {current.gate.decision === "SAFE" && "SAFE — 1키 즉시 승인 가능"}
                {current.gate.decision === "CHECK" && "CHECK — 사유 확인 후 승인"}
                {current.gate.decision === "BLOCKED" && "BLOCKED — 승인 불가"}
              </span>
              <span className="text-[12.5px] text-[#4A4A48]">
                {current.gate.risk.score === 0
                  ? "위험 플래그 없음"
                  : `위험 ${current.gate.risk.score}점: ${current.gate.risk.reasons.join(" · ")}`}
                {current.gate.trusted ? " · 신뢰 출처" : " · 미신뢰 출처"}
                {current.gate.dedup.length === 0
                  ? " · dedup 무충돌"
                  : ` · 중복 후보 ${current.gate.dedup.length}건`}
              </span>
              <span className="ml-auto font-mono text-[10.5px] font-semibold tracking-[0.08em] text-[#8A8A86]">
                {idx + 1} / {items.length}
              </span>
            </div>

            <div className="p-5">
              <h2 className="mb-1 text-lg font-extrabold tracking-tight">{current.title}</h2>
              <div className="mb-3.5 text-[12.5px] text-[#8A8A86]">
                {current.source_name} · 수집 {current.created_at.slice(5, 10)} · 품질{" "}
                {current.quality_score ?? "?"} ·{" "}
                {current.source_url ? (
                  <a
                    href={current.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary"
                  >
                    원문 열기 (5)
                  </a>
                ) : (
                  <span className="font-bold text-[#DC2626]">원문 URL 없음</span>
                )}
              </div>

              {/* 핵심 필드 */}
              <div className="mb-3 rounded-lg border border-[#E7E5E0] px-4 py-1">
                {(
                  [
                    ["마감", current.deadline ? `${current.deadline} (${dday(current.deadline)})` : null],
                    ["지원 방식", current.apply_email ? `이메일 — ${current.apply_email}` : null],
                    ["제출물", current.requirements],
                    ["분류", current.category ?? current.company],
                  ] as [string, string | null][]
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline gap-3 border-b border-[#F0F0EE] py-2 text-[13.5px] last:border-b-0"
                  >
                    <span className="w-20 shrink-0 text-[12.5px] text-[#8A8A86]">{label}</span>
                    {value ? (
                      <b className="min-w-0 break-all">{value}</b>
                    ) : (
                      <span className="font-bold text-[#DC2626]">없음 — 원문 확인</span>
                    )}
                  </div>
                ))}
              </div>

              {/* dedup 후보 — 있으면 승인보다 강조 */}
              {current.gate.dedup.length > 0 && (
                <div className="mb-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2.5 text-[12.5px] text-[#4A4A48]">
                  <b className="text-[#B45309]">중복 후보 {current.gate.dedup.length}건 (동일 지원 이메일)</b>
                  {current.gate.dedup.slice(0, 3).map((d) => (
                    <div key={d.id} className="mt-1">
                      · {d.title} — {d.review_status}
                      {d.deadline ? ` · 마감 ${d.deadline}` : ""}
                    </div>
                  ))}
                  <div className="mt-1 text-[11.5px] text-[#8A8A86]">병합 확정(3)은 R1b — 지금은 원문 대조 후 거절/승인으로 처리</div>
                </div>
              )}

              {/* 본문 스니펫 */}
              <div className="mb-3 max-h-48 overflow-y-auto rounded-lg bg-[#FAFAF7] px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#4A4A48]">
                {current.description?.trim() || "본문 없음 — 원문 확인 필요"}
              </div>

              {/* BLOCKED 사유 */}
              {current.gate.decision === "BLOCKED" && (
                <div className="mb-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#DC2626]">
                  <b>승인 차단 사유</b>
                  {current.gate.blockedReasons.map((r) => (
                    <div key={r}>· {r}</div>
                  ))}
                </div>
              )}

              {/* CHECK 확인 패널 */}
              {confirmReasons && current.gate.decision === "CHECK" && (
                <div className="mb-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[13px] text-[#4A4A48]">
                  <b className="text-[#B45309]">확인 필요 — 아래 사유를 검토했습니까?</b>
                  {confirmReasons.map((r) => (
                    <div key={r}>· {r}</div>
                  ))}
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => act("approve", true)}
                      disabled={busy}
                      className="rounded-lg bg-[#B45309] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      검토 완료 — 게시 승인
                    </button>
                    <button
                      onClick={() => setConfirmReasons(null)}
                      className="rounded-lg border border-[#E7E5E0] px-4 py-2 text-[13px] font-semibold"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              {/* 액션 — 게시 승인 ≠ 원클릭 ≠ trust (승인 범위 3분리) */}
              <div className="hidden gap-2.5 lg:flex">
                <button
                  onClick={() => act("approve")}
                  disabled={busy || current.gate.decision === "BLOCKED"}
                  className={`flex-[1.2] rounded-[10px] px-3 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 ${
                    current.gate.decision === "CHECK" ? "bg-[#B45309]" : "bg-primary"
                  }`}
                >
                  게시 승인 (1)
                </button>
                <button
                  onClick={() => act("reject")}
                  disabled={busy}
                  className="flex-1 rounded-[10px] border border-[#E7E5E0] px-3 py-3 text-sm font-semibold text-[#4A4A48] disabled:opacity-50"
                >
                  거절 (2)
                </button>
                <button
                  onClick={() => act("quarantine")}
                  disabled={busy}
                  className="flex-1 rounded-[10px] border border-[#E7E5E0] px-3 py-3 text-sm font-semibold text-[#4A4A48] disabled:opacity-50"
                >
                  격리 (4)
                </button>
                <div className="flex flex-[1.4] items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[#C9C7C1] px-3 py-3 text-center text-[12.5px] font-semibold text-[#8A8A86]">
                  원클릭 활성화 — M2 별도 검토
                </div>
              </div>
              {/* 모바일: 긴급 조치만 (39 §4 — 게시 승인 금지) */}
              <div className="flex gap-2.5 lg:hidden">
                <button
                  onClick={() => act("quarantine")}
                  disabled={busy}
                  className="flex-1 rounded-[10px] border border-[#E7E5E0] px-3 py-3 text-sm font-semibold text-[#4A4A48] disabled:opacity-50"
                >
                  격리
                </button>
                <div className="flex flex-[2] items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[#C9C7C1] px-3 py-2 text-center text-[12px] text-[#8A8A86]">
                  게시 승인은 데스크톱에서
                </div>
              </div>
              <p className="mt-2 text-[11.5px] text-[#8A8A86]">
                승인 = 게시만. 원클릭·출처 trust 승격은 이 버튼에 묶이지 않는다 (39 §2).
              </p>
            </div>
          </div>
        )}
      </main>

      {/* 우: 단축키 + 최근 액션 */}
      <aside className="hidden w-[230px] shrink-0 flex-col gap-3.5 py-6 pr-5 lg:flex lg:h-full lg:overflow-y-auto">
        <div className="rounded-[10px] border border-[#E7E5E0] bg-white px-4 py-3.5">
          <span className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-[#8A8A86] uppercase">
            단축키
          </span>
          <div className="mt-2.5 flex flex-col gap-1.5 text-[12.5px] text-[#4A4A48]">
            <div>1 승인 (SAFE만 즉시)</div>
            <div>2 거절 · 4 격리</div>
            <div>5 원문 · s 스킵</div>
            <div>u 되돌리기</div>
            <div className="text-[#C9C7C1]">3 병합 (R1b) · o 원클릭 (M2)</div>
          </div>
        </div>
        <div className="flex-1 rounded-[10px] border border-[#E7E5E0] bg-white px-4 py-3.5">
          <span className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-[#8A8A86] uppercase">
            최근 액션 · undo
          </span>
          {logUnavailable && (
            <p className="mt-2 text-[11.5px] text-[#DC2626]">
              admin_actions 조회 불가 — 013 마이그레이션 적용 필요
            </p>
          )}
          <div className="mt-2.5 flex flex-col gap-2 text-[12px] leading-snug text-[#4A4A48]">
            {recent.slice(0, 10).map((r) => (
              <div key={r.id}>
                {ACTION_LABEL[r.action] ?? r.action} — {r.audition_title ?? "(제목 없음)"}
                <br />
                <span className="text-[#C9C7C1]">{r.created_at.slice(11, 16)} · </span>
                {r.action !== "undo" && !r.undone_by ? (
                  <button onClick={() => undo(r.id)} className="text-primary" disabled={busy}>
                    되돌리기
                  </button>
                ) : (
                  <span className="text-[#C9C7C1]">
                    {r.undone_by ? "되돌림 완료" : "로그 기록됨"}
                  </span>
                )}
              </div>
            ))}
            {recent.length === 0 && !logUnavailable && (
              <span className="text-[#C9C7C1]">아직 액션 없음</span>
            )}
          </div>
        </div>
        <div className="rounded-[10px] bg-[#161615] px-4 py-3 text-[11.5px] leading-relaxed text-[#C9C7C1]">
          오늘 처리 <b className="text-[#FAFAF7] tabular-nums">{processed}</b>건
          <br />
          목표 60건/30분 페이스
        </div>
      </aside>

      {/* 일괄 승인 모달 — 건수 숫자 직접 입력 확인 (39 §3) */}
      {bulk.open && bulkSource && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E7E5E0] bg-white p-5 shadow-lg">
            <h3 className="text-[15px] font-extrabold">이 출처의 SAFE 후보 일괄 승인</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[#4A4A48]">
              출처 <b>{bulkSource}</b>
              <br />
              대상 <b className="tabular-nums">{bulkTargets}</b>건 (SAFE만) · 제외{" "}
              <b className="tabular-nums">{bulkExcluded}</b>건 (CHECK/BLOCKED)
              <br />
              <span className="text-[11.5px] text-[#8A8A86]">
                원클릭·trust 승격은 포함되지 않는다. 신뢰 출처·승인율 조건은 서버가 재검증한다.
              </span>
            </p>
            {bulk.error && (
              <p className="mt-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#DC2626]">
                {bulk.error}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <input
                value={bulk.input}
                onChange={(e) => setBulk((b) => ({ ...b, input: e.target.value }))}
                placeholder={`승인 건수 "${bulkTargets}" 직접 입력`}
                className="flex-1 rounded-lg border border-[#E7E5E0] px-3 py-2.5 text-[14px] tabular-nums"
                inputMode="numeric"
                autoFocus
              />
              <button
                onClick={submitBulk}
                disabled={busy || bulk.input.trim() === ""}
                className="rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40"
              >
                일괄 승인
              </button>
              <button
                onClick={() => setBulk({ open: false, input: "", error: null })}
                className="rounded-lg border border-[#E7E5E0] px-4 py-2.5 text-[13.5px] font-semibold"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5초 undo 토스트 */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-[#161615] px-5 py-2.5 text-[13px] text-white shadow-lg">
          <span className="max-w-72 truncate">{toast.label}</span>
          {toast.actionId && (
            <button
              onClick={() => undo(toast.actionId!)}
              className="font-bold text-[#A5B4FC]"
              disabled={busy}
            >
              되돌리기 (u)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
