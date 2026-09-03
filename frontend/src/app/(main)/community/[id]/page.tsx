import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { buildCommentTree, type RawCommentRow } from "@/lib/community/comments";
import { resolveAuthorName } from "@/lib/community/author";
import { PostClient } from "./PostClient";
import type { CommunityPost, CommunityComment } from "@/types";

/**
 * 커뮤니티 글 상세 — 서버 렌더(SSR, F9). 그전에는 "use client"라 본문·댓글이
 * 초기 HTML에 없었다(구글 외 크롤러는 JS를 실행하지 않는다 — 오디션 상세와 동일 사유,
 * `audition/[id]/page.tsx` 주석 참고). 메타·JSON-LD는 `layout.tsx`가 맡는다.
 */

interface JoinedPostRow {
  id: string;
  /** 022 마이그레이션: 작성자 탈퇴 시 null (SET NULL) */
  user_id: string | null;
  category: CommunityPost["category"];
  title: string;
  content: string;
  likes_count: number;
  comments_count: number;
  views_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profiles: { name: string; photo_urls: string[] } | null;
}

async function getPost(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  id: string
): Promise<{ post: CommunityPost; currentUserId: string | null } | null> {
  // 조회수 증가 — 실패해도 상세 렌더는 막지 않는다
  await supabase.rpc("increment_post_views", { p_post_id: id }).then(
    () => {},
    () => {}
  );

  const { data: post, error } = await supabase
    .from("community_posts")
    .select("*, profiles!community_posts_user_id_profiles_fkey(name, photo_urls)")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !post) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasLiked = false;
  if (user) {
    const { data: like } = await supabase
      .from("community_likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("post_id", id)
      .maybeSingle();
    hasLiked = !!like;
  }

  const row = post as unknown as JoinedPostRow;
  const { profiles, ...rest } = row;

  return {
    post: {
      ...rest,
      author_name: resolveAuthorName(row.user_id, profiles?.name),
      author_photo: profiles?.photo_urls?.[0] || undefined,
      has_liked: hasLiked,
    },
    currentUserId: user?.id ?? null,
  };
}

async function getComments(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  postId: string
): Promise<CommunityComment[]> {
  const { data: comments, error } = await supabase
    .from("community_comments")
    .select("*, profiles!community_comments_user_id_profiles_fkey(name, photo_urls)")
    .eq("post_id", postId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error || !comments) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let likedIds = new Set<string>();
  if (user && comments.length > 0) {
    const commentIds = comments.map((c) => c.id);
    const { data: likes } = await supabase
      .from("community_likes")
      .select("comment_id")
      .eq("user_id", user.id)
      .in("comment_id", commentIds);
    if (likes) {
      likedIds = new Set(likes.map((l) => l.comment_id).filter(Boolean));
    }
  }

  const rows: RawCommentRow[] = comments.map((c) => {
    const profile = c.profiles as { name: string; photo_urls: string[] } | null;
    return {
      id: c.id,
      post_id: c.post_id,
      user_id: c.user_id,
      parent_id: c.parent_id,
      content: c.content,
      likes_count: c.likes_count,
      is_active: c.is_active,
      created_at: c.created_at,
      author_name: profile?.name,
      author_photo: profile?.photo_urls?.[0] || undefined,
    };
  });

  return buildCommentTree(rows, likedIds);
}

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  const result = await getPost(supabase, id);
  if (!result) notFound();

  const comments = await getComments(supabase, id);

  return (
    <PostClient
      postId={id}
      initialPost={result.post}
      initialComments={comments}
    />
  );
}
