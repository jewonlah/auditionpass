"use client";

// 신고 면 (39 §1 ③): SLA 타이머 · 심각 우선 · 조치 3종(게시중지·격리·유지) + 처리 메모.
// 심각 신고는 접수 시점에 이미 자동 조치(원클릭 차단·강등)가 걸려 있고, 여기서 확정한다.

import { useCallback, useEffect, useState } from "react";
import { REASON_MAP, SEVERITY_LABEL, STATUS_LABEL, type ReportSeverity, type ReportStatus } from "@/lib/reports";

type Report = {
  id: number;
  audition_id: string;
  reason: string;
  severity: ReportSeverity;
  detail: string | null;
  status: ReportStatus;
  sla_due_at: string;
  auto_action: string | null;
  admin_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  applicantCount: number;
  audition: {
    id: string;
    title: string;
    source_name: string | null;
    source_url: string | null;
    is_active: boolean;
    review_status: string;
    oneclick_blocked: boolean;
  } | null;
};

function slaRemain(due: string): { label: string; overdue: boolean } {
  const diffMs = new Date(due).getTime() - Date.now();
  const overdue = diffMs < 0;
  const hours = Math.floor(Math.abs(diffMs) / 3600000);
  const label =
    hours >= 24 ? `${Math.floor(hours / 24)}일 ${hours % 24}시간` : `${hours}시간`;
  return { label: overdue ? `${label} 초과` : `${label} 남음`, overdue };
}

const SEVERITY_STYLE: Record<ReportSeverity, string> = {
  severe: "bg-[#FEF2F2] text-[#DC2626]",
  takedown: "bg-[#FFFBEB] text-[#B45309]",
  normal: "bg-[#F3F4F6] text-[#6B7280]",
};

export function ReportsClient() {
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [showHandled, setShowHandled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "신고 조회 실패");
      setItems(data.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "신고 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (
    report: Report,
    decision: "unpublish" | "quarantine" | "dismiss" | "note" | "unblock",
    unblockOneclick = false
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          decision,
          note: notes[report.id] ?? report.admin_note ?? null,
          unblockOneclick,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "처리 실패");
      setMessage(
        decision === "note"
          ? `메모 저장 — 신고 #${report.id}`
          : `${data.actionLabel} 처리 완료 — 신고 #${report.id}`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  };

  const open = items.filter((r) => r.status === "received");
  const handled = items.filter((r) => r.status !== "received");
  const visible = showHandled ? handled : open;

  return (
    <main className="flex flex-col gap-3.5 p-5 lg:p-7">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-[22px] font-extrabold tracking-tight">신고</h1>
        <span className="text-[12.5px] text-[#8A8A86]">
          미처리 {open.length}건 · 처리 완료 {handled.length}건
        </span>
        <button
          onClick={() => setShowHandled((v) => !v)}
          className="ml-auto text-[12.5px] font-bold text-primary"
        >
          {showHandled ? "미처리 보기" : "처리 완료 보기"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#DC2626]">{error}</p>
      )}
      {message && (
        <p className="rounded-lg bg-[#ECFDF5] px-3.5 py-2.5 text-[13px] text-[#059669]">{message}</p>
      )}

      {loading ? (
        <p className="text-[13px] text-[#8A8A86]">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-[10px] border border-[#E7E5E0] bg-white px-4 py-6 text-center text-[13px] text-[#8A8A86]">
          {showHandled ? "처리 완료된 신고가 없습니다." : "미처리 신고가 없습니다."}
        </p>
      ) : (
        visible.map((r) => {
          const reason = REASON_MAP.get(r.reason);
          const sla = slaRemain(r.sla_due_at);
          return (
            <section key={r.id} className="rounded-[10px] border border-[#E7E5E0] bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-[#F0F0EE] px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${SEVERITY_STYLE[r.severity]}`}
                >
                  {SEVERITY_LABEL[r.severity]}
                </span>
                <b className="text-[14px]">{reason?.label ?? r.reason}</b>
                {r.status === "received" ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      sla.overdue ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#EEF2FF] text-[#3730A3]"
                    }`}
                  >
                    SLA {sla.label}
                  </span>
                ) : (
                  <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-bold text-[#6B7280]">
                    {STATUS_LABEL[r.status]}
                  </span>
                )}
                <span className="ml-auto text-[11.5px] text-[#8A8A86]">
                  접수 {r.created_at.slice(5, 16).replace("T", " ")}
                </span>
              </div>

              <div className="px-4 py-3">
                <div className="text-[13.5px] font-semibold">
                  {r.audition?.title ?? "(삭제된 공고)"}
                </div>
                <div className="mt-0.5 text-[12px] text-[#8A8A86]">
                  {r.audition?.source_name?.split(":")[0] ?? "-"} ·{" "}
                  {r.audition?.is_active ? "게시 중" : "비게시"} · {r.audition?.review_status}
                  {r.audition?.oneclick_blocked ? " · 원클릭 차단됨" : ""}
                  {r.audition?.source_url && (
                    <>
                      {" · "}
                      <a
                        href={r.audition.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary"
                      >
                        원문 열기
                      </a>
                    </>
                  )}
                </div>

                {r.detail && (
                  <p className="mt-2 rounded-lg bg-[#FAFAF7] px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#4A4A48]">
                    {r.detail}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[#8A8A86]">
                  {r.auto_action && <span>자동 조치: {r.auto_action}</span>}
                  {r.applicantCount > 0 && (
                    <span className="font-bold text-[#B45309]">
                      기존 지원자 {r.applicantCount}명 — 주의 알림 대상 (발송은 M2)
                    </span>
                  )}
                  {r.handled_by && (
                    <span>
                      처리 {r.handled_by} · {r.handled_at?.slice(5, 16).replace("T", " ")}
                    </span>
                  )}
                </div>

                <input
                  value={notes[r.id] ?? r.admin_note ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="처리 메모 (근거·확인 내용)"
                  className="mt-2.5 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-[13px]"
                />

                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    onClick={() => decide(r, "unpublish")}
                    disabled={busy}
                    className="rounded-lg bg-[#B45309] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    게시중지
                  </button>
                  <button
                    onClick={() => decide(r, "quarantine")}
                    disabled={busy}
                    className="rounded-lg bg-[#DC2626] px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    격리
                  </button>
                  <button
                    onClick={() => decide(r, "dismiss")}
                    disabled={busy}
                    className="rounded-lg border border-[#E7E5E0] px-3.5 py-2 text-[13px] font-semibold text-[#4A4A48] disabled:opacity-50"
                  >
                    유지 (신고 반려)
                  </button>
                  {r.audition?.oneclick_blocked &&
                    (r.status === "received" ? (
                      <button
                        onClick={() => decide(r, "dismiss", true)}
                        disabled={busy}
                        className="rounded-lg border border-[#E7E5E0] px-3.5 py-2 text-[13px] font-semibold text-[#059669] disabled:opacity-50"
                      >
                        유지 + 원클릭 차단 해제
                      </button>
                    ) : (
                      // 이미 처리된 신고 — 공고를 되살릴 때 쓰는 유일한 해제 경로
                      <button
                        onClick={() => decide(r, "unblock")}
                        disabled={busy}
                        className="rounded-lg border border-[#E7E5E0] px-3.5 py-2 text-[13px] font-semibold text-[#059669] disabled:opacity-50"
                      >
                        원클릭 차단 해제
                      </button>
                    ))}
                  <button
                    onClick={() => decide(r, "note")}
                    disabled={busy}
                    className="ml-auto text-[12.5px] font-semibold text-[#8A8A86] underline disabled:opacity-50"
                  >
                    메모만 저장
                  </button>
                </div>
              </div>
            </section>
          );
        })
      )}
      <p className="text-[11.5px] text-[#8A8A86]">
        SLA: 심각 24시간 · 삭제 요청 48시간 · 일반 3일 (36 §4). 유저에게는 접수됨/조치됨/유지됨
        3상태로만 보인다.
      </p>
    </main>
  );
}
