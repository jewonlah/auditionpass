// 커뮤니티 글·댓글 작성자 표시 이름 — 단일 소스.
//
// 022 마이그레이션(2026-09-03, Codex 리뷰 결함 #1)으로 회원 탈퇴 시
// community_posts.user_id / community_comments.user_id 가 CASCADE 삭제 대신
// SET NULL 로 익명화된다. user_id가 null이면 profiles 조인 자체가 나오지 않으므로
// "익명"(활동 중인 유저가 이름을 안 채운 경우)과 구분해 "탈퇴한 회원"으로 표시한다.
export function resolveAuthorName(
  userId: string | null,
  profileName: string | null | undefined
): string {
  if (!userId) return "탈퇴한 회원";
  return profileName || "익명";
}
