// 회원 탈퇴 삭제 계획 — 순서가 정본 (11_prd F3 · 개인정보처리방침 §6 "회원 탈퇴 시 즉시 파기").
//
// 이 파일에는 부작용이 없다. 라우트(app/api/account/delete)가 이 배열을 그대로 실행하고,
// deletion-plan.test.ts 가 순서를 고정한다. 순서를 바꾸려면 테스트부터 바꿔야 한다.
//
// ── 순서를 이렇게 잡은 이유 (database/migrations 의 실제 FK 를 읽고 결정) ──
// auth.users 삭제는 아래를 CASCADE 로 함께 지운다:
//   profiles(001) · applications(001) · subscriptions(001) · bookmarks(009a)
//   community_posts / community_comments / community_likes(006)
// 반대로 CASCADE 되지 **않는** 것:
//   ① Supabase Storage `profiles` 버킷 오브젝트 — Postgres FK 밖이라 남는다. 반드시 선삭제.
//   ② reports(015) — reporter_id 가 ON DELETE SET NULL 이라 행은 남고 신고자만 익명화된다.
//
// 그래서 "auth.users 삭제"를 **맨 마지막**에 둔다. 앞 단계가 실패하면 계정은 살아 있고
// 사용자는 다시 시도할 수 있다. 반대로 auth 를 먼저 지우면 Storage 파일이 주인 없이 영구히 남는다.

/** 각 단계가 데이터에 하는 일 */
export type DeletionMode =
  /** Supabase Storage 오브젝트 삭제 (FK CASCADE 대상 아님) */
  | "storage"
  /** 행 삭제 */
  | "delete"
  /** is_active=false 로 게시 중단 (행 유지) */
  | "soft_delete"
  /** 직접 실행하지 않음 — auth.users 삭제 시 FK ON DELETE SET NULL 로 익명화 */
  | "fk_anonymize"
  /** auth.admin.deleteUser */
  | "auth";

export interface DeletionStep {
  /** 실패 보고용 안정 키 */
  key: string;
  /** 대상 테이블 또는 스토리지 버킷 */
  target: string;
  mode: DeletionMode;
  /** 사용자를 식별하는 컬럼 (storage/auth 단계는 없음) */
  column?: "user_id" | "id" | "reporter_id";
  /** 실패 시 사용자에게 보여줄 한국어 단계명 */
  label: string;
  /** 라우트가 실제로 쿼리를 실행하는 단계인가 */
  executed: boolean;
  note: string;
}

/**
 * 탈퇴 실행 계획. 배열 순서 = 실행 순서.
 */
export function buildDeletionPlan(): DeletionStep[] {
  return [
    {
      key: "storage_profiles",
      target: "storage:profiles",
      mode: "storage",
      label: "프로필 사진 삭제",
      executed: true,
      note:
        "경로 규칙 `${userId}/${timestamp}.${ext}` (app/api/profile/photos). " +
        "FK CASCADE 밖이라 auth.users 삭제보다 반드시 먼저 지운다.",
    },
    {
      key: "bookmarks",
      target: "bookmarks",
      mode: "delete",
      column: "user_id",
      label: "찜 목록 삭제",
      executed: true,
      note: "009a. CASCADE 대상이지만 명시 삭제해 실패 지점을 특정한다.",
    },
    {
      key: "applications",
      target: "applications",
      mode: "delete",
      column: "user_id",
      label: "지원 이력 삭제",
      executed: true,
      note: "001. 지원 메일에 실린 개인정보의 로컬 사본 — 즉시 파기 대상.",
    },
    {
      key: "community_likes",
      target: "community_likes",
      mode: "delete",
      column: "user_id",
      label: "커뮤니티 좋아요 삭제",
      executed: true,
      note:
        "006. 게시글/댓글의 likes_count 는 비정규화 값이라 재계산하지 않는다 — " +
        "탈퇴자 좋아요만큼 과다 집계될 수 있다(표시 오차, 안전 신호 아님).",
    },
    {
      key: "community_comments",
      target: "community_comments",
      mode: "soft_delete",
      column: "user_id",
      label: "커뮤니티 댓글 비공개 처리",
      executed: true,
      note:
        "006. is_active=false 로 먼저 내린다. 현재 FK 가 auth.users CASCADE 라 " +
        "최종적으로 행까지 사라지지만, 마지막 단계가 실패해도 노출은 즉시 멈춘다.",
    },
    {
      key: "community_posts",
      target: "community_posts",
      mode: "soft_delete",
      column: "user_id",
      label: "커뮤니티 게시글 비공개 처리",
      executed: true,
      note:
        "006. 위와 동일. ⚠️ 현재 스키마에서는 auth.users CASCADE 로 글이 삭제되고, " +
        "community_comments.post_id 도 CASCADE 라 **다른 사용자의 댓글까지 함께 사라진다**. " +
        "스레드를 보존하려면 user_id 를 nullable + ON DELETE SET NULL 로 바꾸는 마이그레이션이 선행돼야 한다.",
    },
    {
      key: "reports",
      target: "reports",
      mode: "fk_anonymize",
      column: "reporter_id",
      label: "신고 이력 익명화",
      executed: false,
      note:
        "015. reporter_id 가 ON DELETE SET NULL 이라 auth.users 삭제만으로 신고자 연결이 끊긴다. " +
        "행을 지우지 않는 이유: auditions.reports_count 는 신고 행 수로 재계산되므로(lib/admin/reportsCount) " +
        "삭제하면 사기 공고의 신고 근거가 사라지고 신뢰 배지가 잘못 상향된다.",
    },
    {
      key: "profiles",
      target: "profiles",
      mode: "delete",
      column: "id",
      label: "프로필 삭제",
      executed: true,
      note: "001. 개인정보 본체(이름·출생연도·성별·연락처·사진 URL).",
    },
    {
      key: "auth_user",
      target: "auth.users",
      mode: "auth",
      label: "계정 삭제",
      executed: true,
      note: "되돌릴 수 없는 마지막 단계. 남은 CASCADE 대상(subscriptions 등)이 여기서 정리된다.",
    },
  ];
}
