"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  MessageSquare,
  TrendingUp,
  ChevronRight,
  Clock,
  Heart,
  MessageCircle,
  Eye,
  PenSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommunityCardSkeleton } from "@/components/ui/Skeleton";
import type { CommunityPost, CommunityCategory } from "@/types";

type FilterCategory = "전체" | CommunityCategory;

const CATEGORIES: FilterCategory[] = [
  "전체",
  "자유",
  "꿀팁",
  "후기",
  "질문",
  "구인",
];

const CATEGORY_COLORS: Record<string, string> = {
  자유: "bg-gray-100 text-gray-600",
  꿀팁: "bg-amber-50 text-amber-600",
  후기: "bg-emerald-50 text-emerald-600",
  질문: "bg-blue-50 text-blue-600",
  구인: "bg-amber-50 text-amber-700",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

interface CommunityClientProps {
  initialPosts: CommunityPost[];
  initialHotPosts: CommunityPost[];
}

/**
 * `/community`의 상호작용 부분 — 카테고리 필터·무한스크롤·글쓰기 진입.
 * 첫 페이지("전체"·최신순)와 HOT 배너는 서버 컴포넌트(`page.tsx`)가 이미 렌더해
 * props로 내려준다 (F9 SSR 전환). 카테고리를 바꿀 때만 클라이언트에서 재조회한다.
 */
export function CommunityClient({
  initialPosts,
  initialHotPosts,
}: CommunityClientProps) {
  const [posts, setPosts] = useState<CommunityPost[]>(initialPosts);
  const [hotPosts] = useState<CommunityPost[]>(initialHotPosts);
  const [selectedCategory, setSelectedCategory] =
    useState<FilterCategory>("전체");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPosts.length >= 20);
  const pageRef = useRef(0);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const didMountRef = useRef(false);

  const fetchPosts = useCallback(
    async (page: number, category: FilterCategory) => {
      const params = new URLSearchParams({
        page: String(page),
        category,
        sort: "latest",
      });

      const res = await fetch(`/api/community?${params}`);
      if (!res.ok) return { posts: [], hasMore: false };
      return res.json();
    },
    []
  );

  // 카테고리 변경 시 리셋 — 최초 마운트는 건너뛴다(서버가 이미 "전체" 첫 페이지를 줬다)
  const resetAndFetch = useCallback(
    async (category: FilterCategory) => {
      setLoading(true);
      setPosts([]);
      setHasMore(true);
      pageRef.current = 0;

      const data = await fetchPosts(0, category);
      setPosts(data.posts);
      setHasMore(data.hasMore);
      setLoading(false);
    },
    [fetchPosts]
  );

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    // TODO(R1.2 F7/F12): React Query 등 캐시 도입 시 effect 페칭 제거
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetAndFetch(selectedCategory);
  }, [selectedCategory, resetAndFetch]);

  // 무한스크롤
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    const data = await fetchPosts(nextPage, selectedCategory);
    if (data.posts.length > 0) {
      setPosts((prev) => [...prev, ...data.posts]);
      pageRef.current = nextPage;
    }
    setHasMore(data.hasMore);
    setLoadingMore(false);
  }, [loadingMore, hasMore, fetchPosts, selectedCategory]);

  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="pb-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">커뮤니티</h1>
        <Link
          href="/community/write"
          className="flex items-center gap-1 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white active:scale-[0.98] transition-transform"
        >
          <PenSquare size={13} />
          글쓰기
        </Link>
      </div>

      {/* HOT 배너 */}
      {hotPosts.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-primary" />
            <span className="text-xs font-bold text-primary">인기 게시글</span>
          </div>
          <div className="space-y-2">
            {hotPosts.map((post, i) => (
              <Link
                key={post.id}
                href={`/community/${post.id}`}
                className="flex items-center gap-2"
              >
                <span className="text-xs font-bold text-primary w-4">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700 truncate flex-1">
                  {post.title}
                </span>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 카테고리 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors active:scale-[0.98]",
              selectedCategory === cat
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-500"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 로딩 */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <CommunityCardSkeleton key={i} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <MessageSquare size={40} className="mb-3 opacity-50" />
          <p className="text-sm mb-1">아직 게시글이 없습니다</p>
          <p className="text-xs">첫 번째 글을 작성해보세요!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* 무한스크롤 감지 */}
      <div ref={observerRef} className="h-4" />
      {loadingMore && (
        <div className="space-y-3 mt-3">
          <CommunityCardSkeleton />
          <CommunityCardSkeleton />
        </div>
      )}
    </div>
  );
}

function PostCard({ post }: { post: CommunityPost }) {
  return (
    <Link
      href={`/community/${post.id}`}
      className="block rounded-xl bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform"
    >
      {/* 카테고리 + 시간 */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            CATEGORY_COLORS[post.category] || "bg-gray-100 text-gray-600"
          )}
        >
          {post.category}
        </span>
        <span className="text-[11px] text-gray-400 flex items-center gap-1">
          <Clock size={10} />
          {timeAgo(post.created_at)}
        </span>
      </div>

      {/* 제목 */}
      <h3 className="text-sm font-bold mb-1 leading-snug">{post.title}</h3>

      {/* 미리보기 */}
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">
        {post.content}
      </p>

      {/* 하단 */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          {post.author_name || "익명"}
        </span>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <Eye size={12} />
            {post.views_count}
          </span>
          <span className="flex items-center gap-1">
            <Heart size={12} />
            {post.likes_count}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={12} />
            {post.comments_count}
          </span>
        </div>
      </div>
    </Link>
  );
}
