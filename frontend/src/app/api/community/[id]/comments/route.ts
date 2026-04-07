import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET: 댓글 목록 (대댓글 포함)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params;
  const supabase = await createServerClient();

  const { data: comments, error } = await supabase
    .from("community_comments")
    .select("*, profiles!community_comments_user_id_profiles_fkey(name, photo_urls)")
    .eq("post_id", postId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 현재 유저 좋아요 여부
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let likedCommentIds: Set<string> = new Set();
  if (user && comments.length > 0) {
    const commentIds = comments.map((c) => c.id);
    const { data: likes } = await supabase
      .from("community_likes")
      .select("comment_id")
      .eq("user_id", user.id)
      .in("comment_id", commentIds);

    if (likes) {
      likedCommentIds = new Set(
        likes.map((l) => l.comment_id).filter(Boolean)
      );
    }
  }

  // 댓글을 트리 구조로 변환
  interface FormattedComment {
    id: string;
    post_id: string;
    user_id: string;
    parent_id: string | null;
    content: string;
    likes_count: number;
    is_active: boolean;
    created_at: string;
    author_name: string;
    author_photo: string | null;
    has_liked: boolean;
    replies: FormattedComment[];
  }

  const commentMap = new Map<string, FormattedComment>();
  const rootComments: FormattedComment[] = [];

  const formattedComments: FormattedComment[] = comments.map((c) => {
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
      author_name: profile?.name || "익명",
      author_photo: profile?.photo_urls?.[0] || null,
      has_liked: likedCommentIds.has(c.id),
      replies: [],
    };
  });

  formattedComments.forEach((c) => commentMap.set(c.id, c));
  formattedComments.forEach((c) => {
    if (c.parent_id && commentMap.has(c.parent_id)) {
      commentMap.get(c.parent_id)!.replies.push(c);
    } else if (!c.parent_id) {
      rootComments.push(c);
    }
  });

  return NextResponse.json({ comments: rootComments });
}

// POST: 댓글/대댓글 작성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const { content, parent_id } = body;

  if (!content?.trim()) {
    return NextResponse.json(
      { error: "댓글 내용을 입력해주세요" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("community_comments")
    .insert({
      post_id: postId,
      user_id: user.id,
      parent_id: parent_id || null,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 댓글 수 증가
  await supabase.rpc("increment_post_comments", { p_post_id: postId });

  return NextResponse.json({ comment: data });
}
