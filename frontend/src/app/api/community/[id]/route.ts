import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET: 게시글 상세
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  // 조회수 증가
  await supabase.rpc("increment_post_views", { p_post_id: id });

  const { data: post, error } = await supabase
    .from("community_posts")
    .select("*, profiles!community_posts_user_id_fkey(name, photo_urls)")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !post) {
    return NextResponse.json(
      { error: "게시글을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 현재 유저의 좋아요 여부
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

  const profile = post.profiles as { name: string; photo_urls: string[] } | null;

  return NextResponse.json({
    post: {
      ...post,
      profiles: undefined,
      author_name: profile?.name || "익명",
      author_photo: profile?.photo_urls?.[0] || null,
      has_liked: hasLiked,
    },
  });
}

// DELETE: 게시글 삭제 (soft delete)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { error } = await supabase
    .from("community_posts")
    .update({ is_active: false })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
