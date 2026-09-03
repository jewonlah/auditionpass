import type { CommunityComment } from "@/types";
import { resolveAuthorName } from "./author";

// 댓글 상세 페이지의 서버 렌더(SSR)와 `/api/community/[id]/comments` 라우트가 같은
// 트리 변환 규칙을 쓰도록 단일 소스로 둔다 — 대댓글은 1단만 지원(부모의 parent_id는 무시).

export interface RawCommentRow {
  id: string;
  post_id: string;
  /** 022 마이그레이션: 탈퇴 시 null (SET NULL) */
  user_id: string | null;
  parent_id: string | null;
  content: string;
  likes_count: number;
  is_active: boolean;
  created_at: string;
  /** profiles 조인 결과의 닉네임 — 조인이 비면 null/undefined */
  author_name?: string | null;
  author_photo?: string | null;
}

/** created_at 오름차순으로 정렬된 flat 댓글 목록을 부모/자식 트리로 변환한다. */
export function buildCommentTree(
  rows: RawCommentRow[],
  likedIds: Set<string> = new Set()
): CommunityComment[] {
  const map = new Map<string, CommunityComment>();
  const roots: CommunityComment[] = [];

  const formatted: CommunityComment[] = rows.map((r) => ({
    id: r.id,
    post_id: r.post_id,
    user_id: r.user_id,
    parent_id: r.parent_id,
    content: r.content,
    likes_count: r.likes_count,
    is_active: r.is_active,
    created_at: r.created_at,
    author_name: resolveAuthorName(r.user_id, r.author_name),
    author_photo: r.author_photo || undefined,
    has_liked: likedIds.has(r.id),
    replies: [],
  }));

  formatted.forEach((c) => map.set(c.id, c));
  formatted.forEach((c) => {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies!.push(c);
    } else if (!c.parent_id) {
      roots.push(c);
    }
  });

  return roots;
}
