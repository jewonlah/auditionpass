"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  PenSquare,
  Trash2,
  Edit3,
  Clock,
  Heart,
  MessageCircle,
  Eye,
  Inbox,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { CommunityPost } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  자유: "bg-gray-100 text-gray-600",
  꿀팁: "bg-amber-50 text-amber-600",
  후기: "bg-emerald-50 text-emerald-600",
  질문: "bg-blue-50 text-blue-600",
  구인: "bg-purple-50 text-purple-600",
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

export default function MyPostsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMyPosts = useCallback(async () => {
    const res = await fetch("/api/community?my=true");
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    fetchMyPosts();
  }, [user, authLoading, router, fetchMyPosts]);

  async function handleDelete(postId: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    const res = await fetch(`/api/community/${postId}`, { method: "DELETE" });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold">내가 쓴 글</h1>
          <p className="text-xs text-gray-400 mt-1">총 {posts.length}개</p>
        </div>
        <Link
          href="/community/write"
          className="flex items-center gap-1 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
        >
          <PenSquare size={13} />
          글쓰기
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Inbox size={48} className="mb-3 opacity-50" />
          <p className="text-sm font-medium mb-1">작성한 글이 없습니다</p>
          <p className="text-xs mb-4">커뮤니티에서 첫 글을 작성해보세요</p>
          <Link
            href="/community"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
          >
            커뮤니티 가기
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="rounded-xl bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
            >
              {/* 상단 */}
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

              {/* 제목 (클릭 시 상세) */}
              <Link href={`/community/${post.id}`}>
                <h3 className="text-sm font-bold mb-1 leading-snug hover:text-primary transition-colors">
                  {post.title}
                </h3>
              </Link>

              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">
                {post.content}
              </p>

              {/* 통계 + 액션 */}
              <div className="flex items-center justify-between">
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
                <div className="flex items-center gap-1">
                  <Link
                    href={`/community/${post.id}/edit`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    <Edit3 size={12} />
                    수정
                  </Link>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} />
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
