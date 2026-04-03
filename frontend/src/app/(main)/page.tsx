"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AuditionCard } from "@/components/audition/AuditionCard";
import { AuditionFilter } from "@/components/audition/AuditionFilter";
import { Search, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Audition } from "@/types";

const PAGE_SIZE = 20;

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialFilter = searchParams.get("filter") || "전체";
  const initialSearch = searchParams.get("q") || "";

  const [auditions, setAuditions] = useState<Audition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const supabase = createClient();
  const observerRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(0);

  const today = new Date().toISOString().split("T")[0];

  // URL 쿼리 파라미터 동기화
  const updateURL = useCallback(
    (filter: string, search: string) => {
      const params = new URLSearchParams();
      if (filter !== "전체") params.set("filter", filter);
      if (search.trim()) params.set("q", search.trim());
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/", { scroll: false });
    },
    [router]
  );

  const fetchPage = useCallback(
    async (page: number, filter: string, search: string) => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("auditions")
        .select("*")
        .eq("is_active", true)
        .or(`deadline.gte.${today},deadline.is.null`);

      // 필터를 DB 쿼리에 적용
      if (filter === "원클릭지원") {
        query = query.eq("apply_type", "email");
      } else if (filter === "사이트지원") {
        query = query.eq("apply_type", "external");
      } else if (filter !== "전체") {
        query = query.eq("genre", filter);
      }

      // 검색어 적용
      if (search.trim()) {
        const q = search.trim();
        query = query.or(`title.ilike.%${q}%,company.ilike.%${q}%`);
      }

      const { data, error } = await query
        .order("deadline", { ascending: true, nullsFirst: false })
        .range(from, to);

      if (error || !data) return [];
      return data.filter((a) => !a.deadline || a.deadline >= today);
    },
    [supabase, today]
  );

  // 필터/검색 변경 시 데이터 초기화 후 첫 페이지만 로드
  const resetAndFetch = useCallback(
    async (filter: string, search: string) => {
      setLoading(true);
      setAuditions([]);
      setHasMore(true);
      pageRef.current = 0;

      const data = await fetchPage(0, filter, search);
      setAuditions(data);
      setHasMore(data.length >= PAGE_SIZE);
      setLoading(false);
    },
    [fetchPage]
  );

  // 초기 로드
  useEffect(() => {
    resetAndFetch(initialFilter, initialSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 필터 변경 핸들러
  const handleFilterChange = useCallback(
    (filter: string) => {
      setSelectedFilter(filter);
      updateURL(filter, searchQuery);
      resetAndFetch(filter, searchQuery);
    },
    [searchQuery, updateURL, resetAndFetch]
  );

  // 검색어 변경 핸들러 (디바운스)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        updateURL(selectedFilter, value);
        resetAndFetch(selectedFilter, value);
      }, 300);
    },
    [selectedFilter, updateURL, resetAndFetch]
  );

  // 추가 로드
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    const data = await fetchPage(nextPage, selectedFilter, searchQuery);
    if (data.length > 0) {
      setAuditions((prev) => [...prev, ...data]);
      pageRef.current = nextPage;
    }
    if (data.length < PAGE_SIZE) {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, fetchPage, selectedFilter, searchQuery]);

  // IntersectionObserver로 무한스크롤
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div>
      {/* 검색 바 */}
      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          placeholder="오디션 검색 (제목, 주최사)"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* 장르 필터 */}
      <AuditionFilter selected={selectedFilter} onSelect={handleFilterChange} />

      {/* 로딩 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : auditions.length > 0 ? (
        <div className="space-y-4">
          {auditions.map((audition) => (
            <AuditionCard key={audition.id} audition={audition} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Search size={40} className="mb-3 opacity-50" />
          <p className="text-sm">검색 결과가 없습니다</p>
          <p className="text-xs mt-1">다른 키워드로 검색해보세요</p>
        </div>
      )}

      {/* 무한스크롤 감지 영역 */}
      <div ref={observerRef} className="h-4" />

      {/* 추가 로딩 스피너 */}
      {loadingMore && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      )}

      {/* 리스트 하단 안내 */}
      {!hasMore && auditions.length > 0 && (
        <p className="mt-4 pb-4 text-center text-xs text-gray-300">
          모든 오디션을 불러왔습니다
        </p>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
