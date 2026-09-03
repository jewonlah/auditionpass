import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { resolveAuthorName } from "@/lib/community/author";
import { CommunityClient } from "./CommunityClient";
import type { CommunityPost } from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr";
const PAGE_SIZE = 20;

export function generateMetadata(): Metadata {
  const title = "커뮤니티";
  const description =
    "오디션 준비생들의 후기·꿀팁·질문을 나누는 오디션패스 커뮤니티. 로그인 없이도 둘러볼 수 있어요.";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ko_KR",
      siteName: "오디션패스",
      url: `${BASE_URL}/community`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: "/community",
    },
  };
}

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

function mapPost(row: JoinedPostRow, likedIds: Set<string>): CommunityPost {
  const { profiles, ...rest } = row;
  return {
    ...rest,
    author_name: resolveAuthorName(row.user_id, profiles?.name),
    author_photo: profiles?.photo_urls?.[0] || undefined,
    has_liked: likedIds.has(row.id),
  };
}

/** 로그인 유저의 좋아요 여부를 초기 목록에도 반영한다 — 클라 재요청 없이 하트 상태가 맞는다. */
async function getLikedPostIds(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  postIds: string[]
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data: likes } = await supabase
    .from("community_likes")
    .select("post_id")
    .eq("user_id", user.id)
    .in("post_id", postIds);

  return new Set((likes ?? []).map((l) => l.post_id));
}

async function getInitialPosts(): Promise<CommunityPost[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("community_posts")
    .select("*, profiles!community_posts_user_id_profiles_fkey(name, photo_urls)")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  if (error || !data) return [];

  const likedIds = await getLikedPostIds(
    supabase,
    data.map((p) => p.id)
  );
  return (data as unknown as JoinedPostRow[]).map((p) => mapPost(p, likedIds));
}

async function getHotPosts(): Promise<CommunityPost[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("community_posts")
    .select("*, profiles!community_posts_user_id_profiles_fkey(name, photo_urls)")
    .eq("is_active", true)
    .order("likes_count", { ascending: false })
    .limit(3);

  if (error || !data) return [];
  return (data as unknown as JoinedPostRow[]).map((p) => mapPost(p, new Set()));
}

export default async function CommunityPage() {
  const [initialPosts, initialHotPosts] = await Promise.all([
    getInitialPosts(),
    getHotPosts(),
  ]);

  return (
    <CommunityClient initialPosts={initialPosts} initialHotPosts={initialHotPosts} />
  );
}
