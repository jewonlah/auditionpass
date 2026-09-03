"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";

// 소스 후보 검수 — 「콜 시트」 언어(20_design-language.md): paper/ink/헤어라인·모노 라벨·정보 밀도.
// 그라데이션·이모지 아이콘·둥근 카드 3열 그리드 금지.
// 604건을 빠르게 훑는 게 목적이라 카드가 아닌 밀집 테이블로 간다.

type Verdict = "approve" | "reject" | "review";

interface Candidate {
  id: string;
  url: string;
  kind: string;
  found_by: string | null;
  hits: number | null;
  sample_title: string | null;
  first_seen: string | null;
  last_seen: string | null;
  ai_verdict: Verdict | null;
  ai_source_type: string | null;
  ai_reason: string | null;
  ai_risk: string | null;
  covered_by: string | null;
}

interface Counts {
  approve: number;
  reject: number;
  review: number;
  unclassified: number;
  covered: number;
  total: number;
}

type TabKey = Verdict | "all" | "unclassified";

const TABS: { key: TabKey; label: string }[] = [
  { key: "approve", label: "AI 승인 제안" },
  { key: "review", label: "판단 필요" },
  { key: "reject", label: "AI 거부 제안" },
  { key: "unclassified", label: "미분류" },
  { key: "all", label: "전체" },
];

// 후보 종류마다 승인의 의미가 다르다 — 섞어서 판단하면 안 된다.
const KINDS: { key: string; label: string; means: string }[] = [
  { key: "", label: "전체", means: "" },
  { key: "domain", label: "사이트", means: "승인 = 이 사이트 게시판을 크롤링 대상에 추가" },
  { key: "blog", label: "블로그", means: "승인 = 이 블로거의 글을 신뢰 출처로 저장" },
  { key: "threads", label: "스레드", means: "승인 = 이 스레드 계정을 수집 화이트리스트에 추가" },
];

const RISK_LABEL: Record<string, string> = {
  none: "없음",
  low: "낮음",
  medium: "중간",
  high: "높음",
};

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export function CandidatesClient() {
  const [tab, setTab] = useState<TabKey>("approve");
  const [kind, setKind] = useState<string>("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [kinds, setKinds] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approved" | "rejected" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (tab !== "all" && tab !== "unclassified") qs.set("verdict", tab);
      if (kind) qs.set("kind", kind);
      const res = await fetch(`/api/admin/candidates?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "조회 실패");
      const rows: Candidate[] = json.items ?? [];
      setItems(tab === "unclassified" ? rows.filter((r) => !r.ai_verdict) : rows);
      setCounts(json.counts ?? null);
      setKinds(json.kinds ?? {});
      setSelected(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "조회 실패");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  // 이미 수집 중인 출처(covered_by)는 승인 대상이 아니므로 전체 선택에서 뺀다.
  const selectable = useMemo(() => items.filter((i) => !i.covered_by), [items]);
  const allChecked = selectable.length > 0 && selected.size === selectable.length;

  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(selectable.map((i) => i.id)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const requestAct = (status: "approved" | "rejected") => {
    if (!selected.size) return;
    setPendingAction(status);
  };

  const act = async (status: "approved" | "rejected") => {
    const ids = [...selected];
    if (!ids.length) return;
    const verb = status === "approved" ? "승인" : "거부";
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status, expectedCount: ids.length }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `${verb} 실패`);
      const parts = [`${json.changed}건 ${verb} 완료`];
      if (json.skipped) parts.push(`${json.skipped}건은 이미 처리됨`);
      if (json.promotedBlogs) parts.push(`블로그 ${json.promotedBlogs}곳 수집 시작됨`);
      if (json.manual?.threads)
        parts.push(`스레드 ${json.manual.threads}건은 promote_candidates.py 실행 필요`);
      if (json.manual?.domain)
        parts.push(`사이트 ${json.manual.domain}건은 게시판 설정 추가 필요`);
      if (json.warning) parts.push(json.warning);
      setMsg(parts.join(" · "));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${verb} 실패`);
    } finally {
      setBusy(false);
    }
  };

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const status = pendingAction;
    await act(status);
    setPendingAction(null);
  }

  const summary = useMemo(() => {
    if (!counts) return null;
    return [
      { label: "승인 제안", v: counts.approve },
      { label: "판단 필요", v: counts.review },
      { label: "거부 제안", v: counts.reject },
      { label: "미분류", v: counts.unclassified },
      { label: "이미 수집 중", v: counts.covered },
      { label: "미처리 합계", v: counts.total },
    ];
  }, [counts]);

  const kindHint = KINDS.find((k) => k.key === kind)?.means ?? "";

  return (
    <div className="min-h-screen bg-[#FAFAF7] px-6 py-6 text-[#141414]">
      <header className="border-b border-[#E7E5E0] pb-4">
        <span className="font-mono text-[10.5px] font-semibold tracking-[0.12em] text-[#4F46E5] uppercase">
          Source Candidates
        </span>
        <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">소스 후보 검수</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#4A4A48]">
          크롤러가 발견했지만 아직 수집 대상이 아닌 도메인·계정입니다. 승인하면 해당 출처의 공고를
          모으기 시작합니다. AI 판정은 <span className="font-semibold">제안일 뿐</span>이며, 반영은
          이 화면의 클릭으로만 일어납니다.
        </p>
      </header>

      {summary && (
        <div className="mt-4 flex flex-wrap items-stretch divide-x divide-[#E7E5E0] border-y border-[#E7E5E0] bg-white">
          {summary.map((s) => (
            <div key={s.label} className="min-w-[116px] flex-1 px-4 py-3">
              <div className="font-mono text-[10px] tracking-[0.08em] text-[#8A8A86] uppercase">
                {s.label}
              </div>
              <div className="mt-0.5 text-[20px] font-extrabold tabular-nums">
                {s.v.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-[#E7E5E0]">
        {TABS.map((t) => {
          const on = tab === t.key;
          const n =
            counts == null
              ? null
              : t.key === "all"
                ? counts.total
                : t.key === "unclassified"
                  ? counts.unclassified
                  : counts[t.key];
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-0.5 pb-2 text-[13.5px] font-semibold transition-colors ${
                on
                  ? "border-[#4F46E5] text-[#141414]"
                  : "border-transparent text-[#8A8A86] hover:text-[#4A4A48]"
              }`}
            >
              {t.label}
              {n != null && (
                <span className="ml-1.5 font-mono text-[11px] tabular-nums">{n}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 종류 필터 — 승인의 의미가 종류마다 다르므로 섞어서 판단하지 않게 분리한다 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-[#8A8A86] uppercase">종류</span>
        {KINDS.map((k) => {
          const on = kind === k.key;
          const n = k.key ? kinds[k.key] : undefined;
          return (
            <button
              key={k.key || "all"}
              onClick={() => setKind(k.key)}
              className={`border px-2.5 py-1 text-[12.5px] font-semibold ${
                on
                  ? "border-[#141414] bg-[#141414] text-[#FAFAF7]"
                  : "border-[#E7E5E0] bg-white text-[#4A4A48] hover:border-[#C9C7C1]"
              }`}
            >
              {k.label}
              {n != null && <span className="ml-1 font-mono text-[11px] tabular-nums">{n}</span>}
            </button>
          );
        })}
        {kindHint && (
          <span className="text-[12px] text-[#4A4A48]">— {kindHint}</span>
        )}
      </div>

      <div className="sticky top-0 z-10 -mx-6 mt-3 flex flex-wrap items-center gap-3 border-y border-[#E7E5E0] bg-[#FAFAF7]/95 px-6 py-3 backdrop-blur">
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="size-4 accent-[#4F46E5]"
            disabled={!selectable.length}
          />
          전체 선택
        </label>
        <span className="font-mono text-[11.5px] tabular-nums text-[#8A8A86]">
          {selected.size} / {selectable.length} 선택
          {items.length !== selectable.length && (
            <span className="ml-1 text-[#F59E0B]">
              (중복 {items.length - selectable.length}건 제외)
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => requestAct("approved")}
            disabled={busy || !selected.size}
            className="border border-[#4F46E5] bg-[#4F46E5] px-3.5 py-1.5 text-[13px] font-semibold text-[#FAFAF7] disabled:border-[#E7E5E0] disabled:bg-[#F0F0EE] disabled:text-[#C9C7C1]"
          >
            선택 승인
          </button>
          <button
            onClick={() => requestAct("rejected")}
            disabled={busy || !selected.size}
            className="border border-[#E7E5E0] bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[#4A4A48] hover:border-[#EF4444] hover:text-[#EF4444] disabled:text-[#C9C7C1]"
          >
            선택 거부
          </button>
        </div>
      </div>

      {(msg || err) && (
        <div
          className={`mt-3 border-l-2 px-3 py-2 text-[13px] ${
            err
              ? "border-[#EF4444] bg-white text-[#EF4444]"
              : "border-[#10B981] bg-white text-[#141414]"
          }`}
        >
          {err ?? msg}
        </div>
      )}

      <div className="mt-4 overflow-x-auto border border-[#E7E5E0] bg-white">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#E7E5E0] font-mono text-[10px] tracking-[0.08em] text-[#8A8A86] uppercase">
              <th className="w-10 px-3 py-2" />
              <th className="w-16 px-2 py-2 text-right">발견</th>
              <th className="px-2 py-2">출처</th>
              <th className="w-28 px-2 py-2">유형</th>
              <th className="w-20 px-2 py-2">위험</th>
              <th className="px-2 py-2">AI 근거 · 대표 제목</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[#8A8A86]">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && !items.length && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[#8A8A86]">
                  이 분류에 남은 후보가 없습니다.
                </td>
              </tr>
            )}
            {items.map((c) => {
              const on = selected.has(c.id);
              const dup = Boolean(c.covered_by);
              return (
                <tr
                  key={c.id}
                  onClick={() => !dup && toggle(c.id)}
                  className={`border-b border-[#F0F0EE] align-top ${
                    dup
                      ? "bg-[#FAFAF7] opacity-60"
                      : on
                        ? "cursor-pointer bg-[#4F46E5]/[0.04]"
                        : "cursor-pointer hover:bg-[#FAFAF7]"
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={dup}
                      className="size-4 accent-[#4F46E5]"
                    />
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-[12px] font-semibold tabular-nums">
                    {(c.hits ?? 0).toLocaleString()}
                  </td>
                  <td className="px-2 py-2.5">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold underline decoration-[#C9C7C1] underline-offset-2 hover:decoration-[#4F46E5]"
                    >
                      {host(c.url)}
                    </a>
                    <div className="mt-0.5 font-mono text-[10.5px] text-[#8A8A86]">
                      {c.kind}
                      {c.found_by ? ` · ${c.found_by}` : ""}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-[12.5px] text-[#4A4A48]">
                    {c.ai_source_type ?? "—"}
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className={`font-mono text-[11px] font-semibold tracking-wide ${
                        c.ai_risk === "high"
                          ? "text-[#EF4444]"
                          : c.ai_risk === "medium"
                            ? "text-[#F59E0B]"
                            : "text-[#8A8A86]"
                      }`}
                    >
                      {RISK_LABEL[c.ai_risk ?? ""] ?? "—"}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-[#4A4A48]">
                    {dup && (
                      <div className="mb-1 inline-block border border-[#F59E0B] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#F59E0B]">
                        이미 수집 중 · {c.covered_by}
                      </div>
                    )}
                    {c.ai_reason && <div className="text-[#141414]">{c.ai_reason}</div>}
                    {c.sample_title && (
                      <div className="mt-0.5 line-clamp-2 text-[12px] text-[#8A8A86]">
                        {c.sample_title}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 border-l-2 border-[#E7E5E0] pl-3 text-[11.5px] leading-relaxed text-[#8A8A86]">
        <p>
          승인 → 발견 큐에서 내리고 <span className="font-semibold text-[#4A4A48]">승격 대기</span>로 표시 ·
          거부 → 큐에서 제외 · 한 번에 최대 200건
        </p>
        <p className="mt-1 text-[#F59E0B]">
          주의: 승인만으로 크롤링이 시작되지는 않습니다. 사이트(domain)는 게시판 목록 URL과 상세
          링크 패턴을 <span className="font-mono">generic_board</span> /{" "}
          <span className="font-mono">official_pages</span>에 추가해야 실제로 수집됩니다.
        </p>
      </div>

      <ConfirmSheet
        open={pendingAction !== null}
        title={`${selected.size}건을 ${pendingAction === "approved" ? "승인" : "거부"}합니다`}
        description="계속할까요?"
        confirmLabel={pendingAction === "approved" ? "승인" : "거부"}
        danger={pendingAction === "rejected"}
        submitting={busy}
        onConfirm={confirmPendingAction}
        onClose={() => setPendingAction(null)}
      />
    </div>
  );
}
