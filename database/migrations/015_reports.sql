-- 015: 신고 + 원클릭 차단 (플랜 36 §4 · 39 §1 ③)
-- 사유 10종(심각 4 · 일반 5 · 삭제요청 1), 사유별 자동 조치, SLA 심각 24h / 일반 3일 / 삭제요청 48h.
-- 유저에게 노출되는 상태는 3종뿐: received(접수됨) / actioned(조치됨) / dismissed(유지됨).

-- 심각 신고 자동 조치의 실행 대상 — 원클릭(이메일 대리 발송) 차단 플래그.
-- 게시(is_active)와 분리: 신뢰 출처 공고는 노출을 유지하되 대리 발송만 막는다.
alter table auditions add column if not exists oneclick_blocked boolean not null default false;

-- 유효 신고 수(반려 제외) 비정규화 — 신뢰 배지(36 §4)를 공고 행만으로 계산하기 위함.
-- reports는 RLS로 본인 신고만 조회 가능하므로 클라이언트가 직접 집계할 수 없다.
-- 접수 시 증가, 운영자 처리 시 재계산 (frontend/src/app/api/report·admin/reports).
alter table auditions add column if not exists reports_count integer not null default 0;

create table if not exists reports (
  id bigserial primary key,
  audition_id uuid not null references auditions(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in (
    -- 심각 4종 (즉시 원클릭 차단 + 강등, 비신뢰 출처면 비활성)
    'fee_demand', 'identity_demand', 'adult_coercion', 'scam',
    -- 일반 5종
    'expired', 'wrong_info', 'duplicate', 'unreachable', 'spam',
    -- 삭제 요청 1종 (게시자·권리자)
    'takedown'
  )),
  severity text not null check (severity in ('severe', 'normal', 'takedown')),
  detail text,
  status text not null default 'received' check (status in ('received', 'actioned', 'dismissed')),
  sla_due_at timestamptz not null,
  auto_action text,          -- 접수 시 자동 조치 내역 (감사용)
  admin_note text,           -- 운영자 처리 메모
  handled_by text,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_open on reports (sla_due_at) where status = 'received';
create index if not exists idx_reports_audition on reports (audition_id);
-- 같은 유저의 같은 공고 중복 신고 방지 (익명 신고는 제외)
create unique index if not exists idx_reports_unique_reporter
  on reports (audition_id, reporter_id) where reporter_id is not null;

alter table reports enable row level security;
-- 본인 신고만 조회·생성. 처리(update)는 service role(어드민 API)만.
create policy "본인 신고 조회" on reports for select using (auth.uid() = reporter_id);
create policy "본인 신고 생성" on reports for insert with check (auth.uid() = reporter_id);
