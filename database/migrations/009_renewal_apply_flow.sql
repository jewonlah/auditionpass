-- ============================================
-- R1.1 리뉴얼 — 지원 플로우 (F5) + 지원 탭 스키마 선행 (F6)
-- Supabase SQL 편집기에서 실행
-- 근거: 00 D2(지원 제한 폐지), 11 PRD F5·F6, 12 IA(출생연도 정본)
-- ============================================

-- 1. profiles: 나이 → 출생연도 전환 (12_ia-userflows 정본: 이름·출생연도·성별·분야)
alter table profiles
  add column if not exists birth_year integer
    check (birth_year is null or (birth_year >= 1940 and birth_year <= 2015));

-- 기존 age 데이터 백필 (만나이 가정: 출생연도 ≈ 현재연도 - 나이)
update profiles
set birth_year = extract(year from current_date)::integer - age
where birth_year is null and age is not null;

-- 신규 유저는 birth_year만 저장하므로 age 필수 해제 (컬럼은 호환용으로 유지, F4에서 제거 검토)
alter table profiles alter column age drop not null;

-- 2. applications: 상태 모델 (F6 — R1은 sent/failed, replied는 R1.2, 열람은 R3 프리미엄)
alter table applications
  add column if not exists status text not null default 'sent'
    check (status in ('sent', 'failed', 'replied')),
  add column if not exists opened_at timestamptz; -- R1.2 Resend open tracking 인프라 예약 (유저 노출 금지 — D2)

-- 3. bookmarks: 찜 (F6 — "R1.1 착수 전 마이그레이션" 항목)
create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audition_id uuid not null references auditions(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, audition_id)
);

alter table bookmarks enable row level security;
create policy "본인 찜 조회" on bookmarks for select using (auth.uid() = user_id);
create policy "본인 찜 생성" on bookmarks for insert with check (auth.uid() = user_id);
create policy "본인 찜 삭제" on bookmarks for delete using (auth.uid() = user_id);

-- 4. 지원 횟수 제한 폐지 (00 D2 — 핵심 행동 벌점화 폐지)
drop function if exists can_apply_today(uuid);
drop function if exists increment_apply_count(uuid);
drop function if exists get_daily_apply_status(uuid);
drop table if exists daily_apply_count;
