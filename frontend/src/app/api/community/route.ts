import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET: 게시글 목록
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { searchParams } = new URL(request.url);

  const category = searchParams.get("category");
  const sort = searchParams.get("sort") || "latest"; // latest | hot
  const page = parseInt(searchParams.get("page") || "0");
  const limit = 20;

  const isMy = searchParams.get("my") === "true";

  let query = supabase
    .from("community_posts")
    .select("*, profiles!community_posts_user_id_profiles_fkey(name, photo_urls)")
    .eq("is_active", true);

  // 내가 쓴 글 필터
  if (isMy) {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }
    query = query.eq("user_id", currentUser.id);
  }

  if (category && category !== "전체") {
    query = query.eq("category", category);
  }

  if (sort === "hot") {
    query = query.order("likes_count", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query.range(
    page * limit,
    (page + 1) * limit - 1
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 현재 유저의 좋아요 여부 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let likedPostIds: Set<string> = new Set();
  if (user && data.length > 0) {
    const postIds = data.map((p) => p.id);
    const { data: likes } = await supabase
      .from("community_likes")
      .select("post_id")
      .eq("user_id", user.id)
      .in("post_id", postIds);

    if (likes) {
      likedPostIds = new Set(likes.map((l) => l.post_id));
    }
  }

  const posts = data.map((post) => {
    const profile = post.profiles as { name: string; photo_urls: string[] } | null;
    return {
      ...post,
      profiles: undefined,
      author_name: profile?.name || "익명",
      author_photo: profile?.photo_urls?.[0] || null,
      has_liked: likedPostIds.has(post.id),
    };
  });

  return NextResponse.json({ posts, hasMore: data.length >= limit });
}

// POST: 게시글 작성
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const { category, title, content } = body;

  if (!category || !title?.trim() || !content?.trim()) {
    return NextResponse.json(
      { error: "카테고리, 제목, 내용을 모두 입력해주세요" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      user_id: user.id,
      category,
      title: title.trim(),
      content: content.trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: data });
}
