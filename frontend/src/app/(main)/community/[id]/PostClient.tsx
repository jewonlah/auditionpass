"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Share2,
  Eye,
  Clock,
  Send,
  CornerDownRight,
  Trash2,
  MoreHorizontal,
  Check,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { cn, withReturnTo } from "@/lib/utils";
import type { CommunityPost, CommunityComment } from "@/types";

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

interface PostClientProps {
  postId: string;
  initialPost: CommunityPost;
  initialComments: CommunityComment[];
}

/**
 * 커뮤니티 글 상세의 인터랙티브 부분 — 좋아요·댓글·공유·삭제.
 * 본문·댓글 초기 데이터는 서버 컴포넌트(`page.tsx`)가 렌더해 props로 내려준다(F9 SSR 전환).
 */
export function PostClient({ postId, initialPost, initialComments }: PostClientProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [post, setPost] = useState<CommunityPost>(initialPost);
  const [comments, setComments] = useState<CommunityComment[]>(initialComments);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/community/${postId}/comments`);
    if (res.ok) {
      const data = await res.json();
      setComments(data.comments);
    }
  }, [postId]);

  async function handleLike() {
    if (!user) {
      router.push(withReturnTo("/login", `/community/${postId}`));
      return;
    }

    const res = await fetch(`/api/community/${postId}/like`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setPost((prev) => ({
        ...prev,
        has_liked: data.liked,
        likes_count: prev.likes_count + (data.liked ? 1 : -1),
      }));
    }
  }

  async function handleComment() {
    if (!user) {
      router.push(withReturnTo("/login", `/community/${postId}`));
      return;
    }
    if (!commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/community/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentText,
          parent_id: replyTo?.id || null,
        }),
      });

      if (res.ok) {
        setCommentText("");
        setReplyTo(null);
        await fetchComments();
        setPost((prev) => ({ ...prev, comments_count: prev.comments_count + 1 }));
      }
    } finally {
      setSubmittingComment(false);
    }
  }

  function handleShare() {
    const url = window.location.href;

    if (navigator.share) {
      navigator.share({
        title: post.title || "오디션패스 커뮤니티",
        text: post.content?.slice(0, 100) || "",
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/community/${postId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/community");
      return;
    }
    setDeleting(false);
    setConfirmingDelete(false);
  }

  // post.user_id는 022 마이그레이션 이후 탈퇴 회원 글에서 null일 수 있다 —
  // null끼리 비교해 "본인 글"로 오판하지 않도록 명시적으로 배제한다.
  const isAuthor = !!post.user_id && user?.id === post.user_id;
  const totalComments = comments.reduce(
    (acc, c) => acc + 1 + (c.replies?.length || 0),
    0
  );

  return (
    <div className="pb-24">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-400 active:text-gray-600 transition-colors"
        >
          <ArrowLeft size={18} />
          <span>뒤로</span>
        </button>
        {isAuthor && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-gray-400 active:text-gray-600"
            >
              <MoreHorizontal size={20} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setConfirmingDelete(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-500 active:bg-red-50 w-full"
                >
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 게시글 */}
      <article className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(240,51,15,0.06)] mb-3">
        {/* 카테고리 + 작성자 */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              CATEGORY_COLORS[post.category] || "bg-gray-100 text-gray-600"
            )}
          >
            {post.category}
          </span>
          <span className="text-[11px] text-gray-400">{post.author_name}</span>
          <span className="text-[11px] text-gray-300">·</span>
          <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
            <Clock size={10} />
            {timeAgo(post.created_at)}
          </span>
        </div>

        {/* 제목 */}
        <h1 className="text-lg font-bold leading-snug mb-4">{post.title}</h1>

        {/* 내용 */}
        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {post.content}
        </div>

        {/* 통계 */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Eye size={13} />
            {post.views_count}
          </span>
          <span className="flex items-center gap-1">
            <Heart size={13} />
            {post.likes_count}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={13} />
            {totalComments}
          </span>
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={handleLike}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors active:scale-[0.98]",
              post.has_liked
                ? "bg-red-50 text-red-500"
                : "bg-gray-50 text-gray-500"
            )}
          >
            <Heart size={15} fill={post.has_liked ? "currentColor" : "none"} />
            좋아요
          </button>
          <button
            onClick={() => {
              const el = document.getElementById("comment-input");
              el?.focus();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-gray-50 text-gray-500 active:scale-[0.98] transition-transform"
          >
            <MessageCircle size={15} />
            댓글
          </button>
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-gray-50 text-gray-500 active:scale-[0.98] transition-transform"
          >
            <Share2 size={15} />
            공유
          </button>
        </div>
      </article>

      {/* 공유 토스트 */}
      {showShareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm shadow-lg">
          <Check size={16} />
          링크가 복사되었습니다
        </div>
      )}

      {/* 댓글 섹션 */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-bold mb-4">
          댓글 {totalComments > 0 && <span className="text-primary">{totalComments}</span>}
        </h2>

        {comments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">
            첫 번째 댓글을 남겨보세요
          </p>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onReply={(c) =>
                  setReplyTo({ id: c.id, name: c.author_name || "익명" })
                }
                isLoggedIn={!!user}
              />
            ))}
          </div>
        )}
      </section>

      {/* 댓글 입력 (고정 하단) */}
      <div className="fixed bottom-14 left-0 right-0 z-40 bg-white border-t border-gray-100 px-4 py-2">
        <div className="mx-auto max-w-md">
          {replyTo && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-primary">
                <CornerDownRight size={10} className="inline mr-1" />
                {replyTo.name}님에게 답글
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-[11px] text-gray-400"
              >
                취소
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              id="comment-input"
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleComment();
                }
              }}
              placeholder={user ? "댓글을 입력해주세요" : "로그인 후 댓글을 남길 수 있습니다"}
              disabled={!user}
              className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <button
              onClick={handleComment}
              disabled={submittingComment || !commentText.trim() || !user}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary text-white active:scale-[0.95] transition-transform disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      <ConfirmSheet
        open={confirmingDelete}
        title="정말 삭제하시겠어요?"
        description="삭제한 글은 되돌릴 수 없어요."
        confirmLabel="삭제"
        danger
        submitting={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function CommentItem({
  comment,
  onReply,
  isLoggedIn,
  isReply = false,
}: {
  comment: CommunityComment;
  onReply: (c: CommunityComment) => void;
  isLoggedIn: boolean;
  isReply?: boolean;
}) {
  return (
    <div className={cn(isReply && "ml-6 pl-3 border-l-2 border-gray-100")}>
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
          {comment.author_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comment.author_photo}
              alt=""
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <span className="text-[10px] font-bold text-primary">
              {(comment.author_name || "?")[0]}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">
              {comment.author_name || "익명"}
            </span>
            <span className="text-[10px] text-gray-400">
              {timeAgo(comment.created_at)}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1 leading-relaxed">
            {comment.content}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            {!isReply && (
              <button
                onClick={() => {
                  if (!isLoggedIn) return;
                  onReply(comment);
                }}
                className="text-[11px] text-gray-400 active:text-primary transition-colors"
              >
                답글
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 대댓글 */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onReply={onReply}
              isLoggedIn={isLoggedIn}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
