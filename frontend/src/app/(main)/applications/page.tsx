"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, CheckCircle2, CircleAlert, Inbox } from "lucide-react";
import { getDday, formatDday } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useBookmarks } from "@/components/audition/Bookmarks";
import { AuditionCard } from "@/components/audition/AuditionCard";
import { AuditionCardSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import type { Audition, Application } from "@/types";

type RecordRow = Pick<Application, "id" | "status" | "sent_at" | "created_at" | "profile_version_id"> & {
  delivery_status?: "unknown" | "accepted" | "delivered" | "bounced";
  send_stopped?: boolean;
  submission_snapshot?: { title?: string; company?: string } | null;
  audition: Pick<Audition, "id" | "title" | "company" | "deadline" | "is_active" | "is_public"> | null;
};

export default function ApplicationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"applications" | "bookmarks">("applications");
  const [items, setItems] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const userId = user?.id;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/history", { signal });
      if (!res.ok) throw Error("지원 기록을 불러오지 못했습니다.");
      const data = await res.json();
      if (!signal?.aborted) { setItems(data.applications); setError(""); }
    } catch {
      if (!signal?.aborted) setError("지원 기록을 불러오지 못했습니다. 다시 시도해주세요.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [userId, refresh]);
  const hasPending = items.some((a) => a.status === "sending");
  useEffect(() => {
    if (!hasPending || !userId) return;
    const controller = new AbortController();
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(controller.signal); }, 10_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [hasPending, userId, refresh]);
  return <div className="pb-4">
    <h1 className="text-2xl font-bold">내 지원</h1>
    <p className="mt-2 text-sm leading-relaxed text-gray-500">지원 기록과 찜한 공고를 모았어요.<br />담당자의 답장은 회원님 이메일로 직접 도착합니다.</p>
    <div className="my-5 grid grid-cols-2 rounded-xl bg-gray-100 p-1" aria-label="지원 목록 선택">
      {(["applications", "bookmarks"] as const).map((value) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}
        className={"min-h-11 rounded-lg text-sm font-semibold " + (tab === value ? "bg-white shadow-sm" : "text-gray-500")}>{value === "applications" ? "지원함" : "찜"}</button>)}
    </div>
    {tab === "bookmarks" ? <SavedAuditions /> : <>
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 p-4 text-sm"><p>{error}</p><Button variant="ghost" onClick={() => refresh()}>다시 불러오기</Button></div>}
      {authLoading || loading ? <AuditionCardSkeleton /> : !user ? <Link href="/login?returnTo=%2Fapplications">로그인하고 확인하기</Link> :
        items.length === 0 && !error ? <Empty text="아직 지원한 오디션이 없어요" /> :
        <div className="space-y-3">{items.map((item) => <ApplicationCard key={item.id} item={item} refresh={refresh} />)}</div>}
    </>}
  </div>;
}

function ApplicationCard({ item, refresh }: { item: RecordRow; refresh: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const pending = item.status === "sending";
  const failed = item.status === "failed";
  const audition = item.audition;
  const Icon = pending ? Clock3 : failed ? CircleAlert : CheckCircle2;
  async function recover() {
    setChecking(true); setMessage("");
    try {
      const res = await fetch("/api/apply/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: item.id }) });
      const data = await res.json();
      if (!res.ok || data.pending) setMessage(data.error || "잠시 후 다시 확인해주세요.");
      await refresh();
    } catch { setMessage("연결이 끊겼습니다. 잠시 후 다시 시도해주세요."); }
    finally { setChecking(false); }
  }
  return <article className="rounded-2xl border border-gray-200 bg-white p-4">
    {audition?.is_active && audition.is_public !== false ? <Link href={"/audition/" + audition.id} className="block">
      <h2 className="font-semibold leading-snug">{audition.title}</h2>
      <p className="mt-1 text-sm text-gray-500">{audition.company} · {!audition.is_active ? "게시 종료" : formatDday(audition.deadline)}</p>
    </Link> : <div><h2 className="font-semibold">{item.submission_snapshot?.title || audition?.title || "게시가 종료된 공고"}</h2><p className="mt-1 text-sm text-gray-500">{item.submission_snapshot?.company || audition?.company} · 게시 종료</p></div>}
    <p className={"mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 text-sm " + (failed ? "text-red-600" : "text-gray-600")}>
      <Icon size={16} />{item.send_stopped ? "추가 발송 중지" : pending ? "발송 결과 확인 중" : failed ? "발송 준비 실패" : item.delivery_status === "bounced" ? "메일 반송" : item.delivery_status === "delivered" ? "수신 서버 전달 완료" : "발송 요청 접수"}
      {item.sent_at && <time className="ml-auto text-xs" dateTime={item.sent_at}>{new Date(item.sent_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>}
    </p>
    {item.delivery_status === "delivered" && <p className="mt-2 text-sm text-gray-500">담당자의 열람·답장 여부는 확인되지 않았어요.</p>}
    {pending && <><p className="mt-2 text-sm text-gray-500">처리가 지연되면 5분 후 결과를 다시 확인할 수 있어요.</p><Button variant="outline" className="mt-3 w-full" onClick={recover} disabled={checking}>{checking ? "확인 중…" : "발송 결과 다시 확인"}</Button></>}
    {failed && !item.send_stopped && audition?.is_active && audition.is_public !== false && <Link className="mt-3 block text-sm font-semibold text-primary" href={"/audition/" + audition.id}>공고에서 다시 지원하기</Link>}
    {(item.send_stopped || item.delivery_status === "bounced") && <p className="mt-2 text-sm text-gray-500">추가 발송하지 않습니다. 문의: <a className="underline" href="mailto:support@auditionpass.co.kr">support@auditionpass.co.kr</a></p>}
    {item.profile_version_id && <Link className="mt-3 block py-2 text-sm font-semibold text-primary" href={`/profile/versions?id=${item.profile_version_id}`}>이 지원에 사용한 프로필 보기</Link>}
    {message && <p role="status" className="mt-2 text-sm text-gray-600">{message}</p>}
  </article>;
}

function SavedAuditions() {
  const { ids, loading: idsLoading } = useBookmarks();
  const [items, setItems] = useState<Audition[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/bookmarks?page=" + page, { signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw Error();
      return res.json();
    }).then((data) => {
      if (controller.signal.aborted) return;
      const rows = (data.bookmarks as { audition: Audition | null }[]).flatMap((b) => b.audition ? [{ ...b.audition, apply_email: null }] : []);
      setItems((prev) => page === 0 ? rows : [...prev, ...rows.filter((row) => !prev.some((p) => p.id === row.id))]);
      setHasMore(data.hasMore); setError("");
    }).catch(() => { if (!controller.signal.aborted) setError("찜한 공고를 불러오지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, retry]);
  const visible = items.filter((a) => ids.has(a.id));
  return <div className="space-y-3">
    {visible.map((a) => <div key={a.id}><AuditionCard audition={a} />{(!a.is_active || (getDday(a.deadline) ?? 0) < 0) && <Link href={"/auditions?filter=" + encodeURIComponent(a.category ?? a.genre)} className="block px-4 py-2 text-sm text-primary">마감된 공고예요 · 같은 분야 더 보기</Link>}</div>)}
    {(loading || idsLoading) && <AuditionCardSkeleton />}
    {!loading && !idsLoading && !visible.length && !error && <Empty text="마음에 드는 공고를 찜해보세요" />}
    {error && <div role="alert"><p className="text-sm">{error}</p><Button variant="outline" onClick={() => { setLoading(true); setRetry((v) => v + 1); }}>다시 불러오기</Button></div>}
    {!loading && hasMore && <Button variant="outline" className="w-full" onClick={() => { setLoading(true); setPage((p) => p + 1); }}>더 보기</Button>}
  </div>;
}
function Empty({ text }: { text: string }) {
  return <div className="py-14 text-center"><Inbox size={36} className="mx-auto text-gray-300" /><p className="mt-3 text-sm text-gray-500">{text}</p><Link className="mt-4 inline-block py-2 font-semibold text-primary" href="/auditions">오디션 둘러보기</Link></div>;
}
