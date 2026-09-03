"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuditionCard } from "@/components/audition/AuditionCard";
import { AuditionFilter } from "@/components/audition/AuditionFilter";
import { AuditionCardSkeleton } from "@/components/ui/Skeleton";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { todayKST } from "@/lib/utils";
import { AUDITION_LIST_COLUMNS } from "@/lib/audition/columns";
import type { Audition } from "@/types";

const PAGE_SIZE = 20;

interface AuditionsClientProps {
  initialItems: Audition[];
  initialFilter: string;
  initialSearch: string;
}

/**
 * `/auditions`의 상호작용 부분 — 필터·검색·무한스크롤·북마크 등.
 * 초기 첫 페이지는 서버 컴포넌트(`page.tsx`)가 이미 렌더해 props로 내려준다
 * (F7+F9 SSR 전환). 여기서는 그 위에 클라이언트 상태로 이어 붙인다.
 */
export function AuditionsClient({
  initialItems,
  initialFilter,
  initialSearch,
}: AuditionsClientProps) {
  const router = useRouter();

  const [auditions, setAuditions] = useState<Audition[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialItems.length >= PAGE_SIZE);
  const [selectedFilter, setSelectedFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const supabase = createClient();
  const observerRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(0);

  const today = todayKST(); // UTC 사용 시 KST 자정~09시에 마감 공고 노출 (F10)

  // URL 쿼리 파라미터 동기화
  const updateURL = useCallback(
    (filter: string, search: string) => {
      const params = new URLSearchParams();
      if (filter !== "전체") params.set("filter", filter);
      if (search.trim()) params.set("q", search.trim());
      const qs = params.toString();
      // B3 버그 수정: 쿼리 빈 값이어도 /auditions 유지 (랜딩/홈 이탈 금지)
      router.replace(qs ? `/auditions?${qs}` : "/auditions", { scroll: false });
    },
    [router]
  );

  const fetchPage = useCallback(
    async (page: number, filter: string, search: string) => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("auditions")
        .select(AUDITION_LIST_COLUMNS)
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
      // AUDITION_LIST_COLUMNS는 apply_email을 select하지 않지만, 타입(Audition)은
      // 해당 필드를 요구한다 — null로 명시해 SSR 첫 페이지(page.tsx)와 같은 모양을 맞춘다.
      return data
        .filter((a) => !a.deadline || a.deadline >= today)
        .map((a) => ({ ...a, apply_email: null }));
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
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <AuditionCardSkeleton key={i} />
          ))}
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

      {/* 추가 로딩 스켈레톤 */}
      {loadingMore && (
        <div className="space-y-4 mt-4">
          <AuditionCardSkeleton />
          <AuditionCardSkeleton />
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
