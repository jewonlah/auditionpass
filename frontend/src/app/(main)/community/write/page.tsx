"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { CommunityCategory } from "@/types";

const CATEGORIES: { key: CommunityCategory; label: string; desc: string }[] = [
  { key: "자유", label: "자유", desc: "일상, 잡담" },
  { key: "꿀팁", label: "꿀팁", desc: "오디션 노하우" },
  { key: "후기", label: "후기", desc: "오디션 경험담" },
  { key: "질문", label: "질문", desc: "궁금한 점" },
  { key: "구인", label: "구인", desc: "배우/모델 모집" },
];

export default function CommunityWritePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [category, setCategory] = useState<CommunityCategory | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  async function handleSubmit() {
    if (!category) {
      setError("카테고리를 선택해주세요");
      return;
    }
    if (!title.trim()) {
      setError("제목을 입력해주세요");
      return;
    }
    if (!content.trim()) {
      setError("내용을 입력해주세요");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, content }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "글 작성에 실패했습니다");
        return;
      }

      const data = await res.json();
      router.push(`/community/${data.post.id}`);
    } catch {
      setError("네트워크 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft size={18} />
          <span>뒤로</span>
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            "등록"
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 mb-4">
          {error}
        </div>
      )}

      {/* 카테고리 선택 */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-500 mb-2 block">
          카테고리
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                category === c.key
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 제목 */}
      <div className="mb-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목을 입력해주세요"
          maxLength={100}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="text-right text-[11px] text-gray-400 mt-1">
          {title.length}/100
        </p>
      </div>

      {/* 내용 */}
      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="내용을 입력해주세요"
          rows={12}
          maxLength={5000}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
        />
        <p className="text-right text-[11px] text-gray-400 mt-1">
          {content.length}/5000
        </p>
      </div>
    </div>
  );
}
