"use client";

// 인테이크 면 (39 §1 ⑤): 가공 잔여물 + 출처 후보.
// 잔여물은 `tools.ingest process`가 규칙으로 못 푼 공고 — 원문을 열어 직접 보정하거나,
// 위험해 보이면 격리로 보낸다. 여기서 공고를 '게시'하지는 않는다(승인은 검수 큐에서만).

import { useCallback, useEffect, useState } from "react";

type QueueItem = {
  id: number;
  audition_id: string;
  title: string | null;
  url: string | null;
  reason: string;
  note: string | null;
  first_seen: string;
  last_seen: string;
  audition: {
    review_status: string;
    is_active: boolean;
    apply_email: string | null;
    deadline: string | null;
    source_name: string | null;
  } | null;
};

type Candidate = {
  id: string;
  url: string;
  kind: string;
  found_by: string | null;
  hits: number;
  sample_title: string | null;
  first_seen: string;
};

export function IntakeClient() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const [candidatesUnavailable, setCandidatesUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/intake");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "조회 실패");
      setQueue(data.queue);
      setCandidates(data.candidates);
      setQueueUnavailable(data.queueUnavailable);
      setCandidatesUnavailable(data.candidatesUnavailable);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    kind: "queue" | "candidate",
    id: number | string,
    action: string,
    label: string
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "처리 실패");
      setMessage(`${data.actionLabel} — ${label}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  };

  const card = "rounded-[10px] border border-[#E7E5E0] bg-white";
  const btn =
    "rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50";

  if (loading) {
    return <p className="p-6 text-[13px] text-[#8A8A86]">불러오는 중…</p>;
  }

  return (
    <main className="flex flex-col gap-4 p-5 lg:p-7">
      <h1 className="text-[22px] font-extrabold tracking-tight">인테이크</h1>

      {error && (
        <p className="rounded-lg bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#DC2626]">{error}</p>
      )}
      {message && (
        <p className="rounded-lg bg-[#ECFDF5] px-3.5 py-2.5 text-[13px] text-[#059669]">{message}</p>
      )}

      {/* 가공 잔여물 */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#F0F0EE] px-4 py-3">
          <b className="text-sm">가공 잔여물</b>
          <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-bold text-[#6B7280]">
            {queue.length}
          </span>
          <span className="text-[11.5px] text-[#8A8A86]">
            규칙으로 이메일·마감을 못 뽑은 공고 — 원문 확인 후 보정하거나 격리
          </span>
        </div>

        {queueUnavailable ? (
          <p className="px-4 py-3 text-[13px] text-[#8A8A86]">
            agent_queue 조회 불가 — 017 마이그레이션 라이브 적용 필요
          </p>
        ) : queue.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-[#8A8A86]">
            열린 잔여물이 없습니다. `python -m tools.ingest process` 실행 후 채워집니다.
          </p>
        ) : (
          queue.map((q) => {
            const fixed = Boolean(q.audition?.apply_email || q.audition?.deadline);
            return (
              <div key={q.id} className="border-b border-[#F0F0EE] px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[10.5px] font-bold text-[#B45309]">
                    {q.reason}
                  </span>
                  {q.audition?.review_status === "quarantine" && (
                    <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10.5px] font-bold text-[#DC2626]">
                      격리됨
                    </span>
                  )}
                  {fixed && (
                    <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold text-[#059669]">
                      값 채워짐 — 처리 완료 가능
                    </span>
                  )}
                  <span className="ml-auto text-[11.5px] text-[#8A8A86]">
                    {q.last_seen.slice(0, 10)}
                  </span>
                </div>

                <div className="mt-1 text-[13.5px] font-semibold">{q.title ?? "(제목 없음)"}</div>
                <div className="mt-0.5 text-[12px] text-[#8A8A86]">
                  {q.audition?.source_name?.split(":")[0] ?? "-"} ·{" "}
                  {q.audition?.apply_email ?? "이메일 없음"} ·{" "}
                  {q.audition?.deadline ?? "마감 없음"}
                  {q.url && (
                    <>
                      {" · "}
                      <a
                        href={q.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary"
                      >
                        원문 열기
                      </a>
                    </>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => act("queue", q.id, "resolve", q.title ?? "")}
                    disabled={busy}
                    className={btn}
                  >
                    처리 완료
                  </button>
                  <button
                    onClick={() => act("queue", q.id, "dismiss", q.title ?? "")}
                    disabled={busy}
                    className={btn}
                  >
                    보류(제외)
                  </button>
                  <button
                    onClick={() => act("queue", q.id, "quarantine", q.title ?? "")}
                    disabled={busy}
                    className="rounded-lg bg-[#DC2626] px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                  >
                    격리 이동
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* 출처 후보 */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#F0F0EE] px-4 py-3">
          <b className="text-sm">출처 후보</b>
          <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-bold text-[#6B7280]">
            {candidates.length}
          </span>
          <span className="text-[11.5px] text-[#8A8A86]">
            검색·SNS에서 발견된 도메인·계정. 승인은 <b>발견 큐 판정</b>일 뿐 자동 게재 권한이 아니다
          </span>
        </div>

        {candidatesUnavailable ? (
          <p className="px-4 py-3 text-[13px] text-[#8A8A86]">source_candidates 조회 불가</p>
        ) : candidates.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-[#8A8A86]">새 후보가 없습니다.</p>
        ) : (
          candidates.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-2 border-b border-[#F0F0EE] px-4 py-2.5 last:border-b-0"
            >
              <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10.5px] font-bold text-[#3730A3]">
                {c.kind}
              </span>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="max-w-96 truncate text-[13px] font-semibold text-primary"
              >
                {c.url}
              </a>
              <span className="text-[11.5px] text-[#8A8A86]">
                {c.hits}회 · {c.found_by ?? "-"}
                {c.sample_title ? ` · "${c.sample_title.slice(0, 30)}"` : ""}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  onClick={() => act("candidate", c.id, "approve", c.url)}
                  disabled={busy}
                  className={btn}
                >
                  승인
                </button>
                <button
                  onClick={() => act("candidate", c.id, "reject", c.url)}
                  disabled={busy}
                  className={btn}
                >
                  거절
                </button>
              </span>
            </div>
          ))
        )}
      </section>

      <p className="text-[11.5px] text-[#8A8A86]">
        잔여물 목록은 `tools.ingest process`가 채우고, 규칙으로 풀린 건은 다음 실행 때 자동으로
        닫힌다. 공고 게시 승인은 여기가 아니라 검수 큐에서만 한다.
      </p>
    </main>
  );
}
