import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// POST: 좋아요 토글
export async function POST(
  _request: NextRequest,
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

  // 이미 좋아요 했는지 확인
  const { data: existing } = await supabase
    .from("community_likes")
    .select("id")
    .eq("user_id", user.id)
    .eq("post_id", postId)
    .maybeSingle();

  if (existing) {
    // 좋아요 취소
    await supabase.from("community_likes").delete().eq("id", existing.id);
    // 카운트 감소
    await supabase.rpc("decrement_post_likes", { p_post_id: postId });
    return NextResponse.json({ liked: false });
  } else {
    // 좋아요 추가
    const { error } = await supabase.from("community_likes").insert({
      user_id: user.id,
      post_id: postId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // 카운트 증가
    await supabase.rpc("increment_post_likes", { p_post_id: postId });
    return NextResponse.json({ liked: true });
  }
}
