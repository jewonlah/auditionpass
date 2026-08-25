-- 013: 어드민 액션 로그 (플랜 39 §1 감사·되돌리기 — R1 필수)
-- 모든 어드민 쓰기(승인·거절·격리·undo)를 기록. undo는 prev 스냅샷으로 복원.
-- RLS 활성 + 정책 없음 = service role 전용 (어드민 API 라우트에서만 접근).

create table if not exists admin_actions (
  id bigserial primary key,
  actor_email text not null,
  action text not null check (action in ('approve', 'reject', 'quarantine', 'undo', 'unpublish')),
  audition_id uuid references auditions(id) on delete set null,
  audition_title text,          -- 로그 화면 표시용 스냅샷 (공고 삭제 후에도 유지)
  prev jsonb,                   -- 변경 전 {review_status, is_active} — undo 복원 근거
  next jsonb,                   -- 변경 후 값
  undone_by bigint references admin_actions(id),  -- 이 액션을 되돌린 undo 액션 id (중복 undo 방지)
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_actions_recent on admin_actions (created_at desc);

alter table admin_actions enable row level security;
