"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchAuditions } from "@/lib/audition/query";
import { CATEGORIES } from "@/lib/categories";
import { AuditionCard } from "@/components/audition/AuditionCard";
import { AuditionFilter } from "@/components/audition/AuditionFilter";
import { AuditionCardSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import type { Audition } from "@/types";

interface Props {
  initialItems: Audition[];
  initialFilter: string;
  initialSearch: string;
  initialSort?: "deadline" | "latest";
  lockedCategory?: string;
}
export function AuditionsClient({ initialItems, initialFilter, initialSearch, initialSort = "deadline", lockedCategory }: Props) {
  const pathname = usePathname();
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState(initialSort);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialItems.length === 20);
  const [error, setError] = useState("");
  const page = useRef(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const active = useRef({ filter: initialFilter, search: initialSearch, sort: initialSort });

  const load = useCallback(async (next: typeof active.current, append = false) => {
    if (append && busy.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    busy.current = true;
    setLoading(true); setError("");
    const nextPage = append ? page.current + 1 : 0;
    try {
      const data = await fetchAuditions(createClient(), { ...next, category: lockedCategory, page: nextPage, signal: controller.signal });
      if (controller.signal.aborted) return;
      setItems((prev) => append ? [...prev, ...data.filter((a) => !prev.some((p) => p.id === a.id))] : data);
      page.current = nextPage;
      setHasMore(data.length === 20);
    } catch {
      if (!controller.signal.aborted) setError("공고를 불러오지 못했습니다. 다시 시도해주세요.");
    } finally {
      if (!controller.signal.aborted) { busy.current = false; setLoading(false); }
    }
  }, [lockedCategory]);

  const change = useCallback((next: typeof active.current) => {
    active.current = next;
    setFilter(next.filter); setSearch(next.search); setSort(next.sort);
    setItems([]);
    const params = new URLSearchParams();
    if (next.filter !== "전체") params.set("filter", next.filter);
    if (next.search.trim()) params.set("q", next.search.trim());
    if (next.sort !== "deadline") params.set("sort", next.sort);
    window.history.replaceState(null, "", pathname + (params.size ? "?" + params.toString() : ""));
    load(next);
  }, [load, pathname]);

  useEffect(() => () => { request.current?.abort(); if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const pop = () => {
      const params = new URLSearchParams(window.location.search);
      const next = { filter: params.get("filter") || "전체", search: params.get("q") || "", sort: params.get("sort") === "latest" ? "latest" as const : "deadline" as const };
      active.current = next; setFilter(next.filter); setSearch(next.search); setSort(next.sort);
      load(next);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [load]);
  useEffect(() => {
    if (!sentinel.current || loading || !hasMore || error) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) load(active.current, true); }, { rootMargin: "100px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [loading, hasMore, error, load]);

  return <div>
    <div className="relative mb-4">
      <Search size={18} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input aria-label="오디션 제목 또는 주최사 검색" type="search" maxLength={200} placeholder="오디션 검색 (제목, 주최사)" value={search}
        onChange={(e) => {
          const value = e.target.value;
          setSearch(value);
          if (timer.current) clearTimeout(timer.current);
          // Invalidate the old response immediately, even during the debounce interval.
          request.current?.abort(); busy.current = false;
          setLoading(true);
          timer.current = setTimeout(() => change({ ...active.current, search: value }), 300);
        }} className="min-h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-base focus:border-primary focus:outline-none" />
    </div>
    <nav aria-label="지원 분야" className="mb-3 flex gap-2 overflow-x-auto pb-2">
      <Link href="/auditions" aria-current={!lockedCategory ? "page" : undefined} className={"shrink-0 rounded-full px-4 py-3 text-sm " + (!lockedCategory ? "bg-primary text-white" : "bg-gray-100")}>전체</Link>
      {CATEGORIES.map((c) => <Link key={c.slug} href={"/auditions/" + c.slug} aria-current={lockedCategory === c.genre ? "page" : undefined}
        className={"shrink-0 rounded-full px-4 py-3 text-sm " + (lockedCategory === c.genre ? "bg-primary text-white" : "bg-gray-100")}>{c.genre}</Link>)}
    </nav>
    <AuditionFilter selected={filter} onSelect={(value) => { if (timer.current) clearTimeout(timer.current); change({ filter: value, search, sort }); }} />
    <div className="mb-4 flex justify-end"><label className="flex items-center gap-2 text-sm text-gray-500">정렬<select aria-label="공고 정렬" value={sort} onChange={(e) => { if (timer.current) clearTimeout(timer.current); change({ filter, search, sort: e.target.value === "latest" ? "latest" : "deadline" }); }} className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"><option value="deadline">마감 임박순</option><option value="latest">최신순</option></select></label></div>
    <div className="space-y-3">{items.map((a) => <AuditionCard key={a.id} audition={a} />)}</div>
    {loading && <div className="mt-3" role="status" aria-label="공고 불러오는 중"><AuditionCardSkeleton /></div>}
    {error && <div role="alert" className="my-5 rounded-xl border border-red-200 p-4"><p className="text-sm">{error}</p><Button variant="ghost" onClick={() => load(active.current)}>다시 불러오기</Button></div>}
    {!loading && !error && items.length === 0 && <p className="py-16 text-center text-sm text-gray-500">검색 결과가 없어요. 다른 검색어나 분야를 선택해보세요.</p>}
    <div ref={sentinel} aria-hidden className="h-4" />
    {!loading && hasMore && !error && <Button variant="outline" className="w-full" onClick={() => load(active.current, true)}>공고 더 보기</Button>}
  </div>;
}
