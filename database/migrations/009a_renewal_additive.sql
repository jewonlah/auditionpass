-- ============================================
-- 009a — 009_renewal_apply_flow §1~3 (추가 전용 분리본)
-- 근거: 30 마스터플랜 0-3 실측(2026-08-20) 결과 009 미적용 확인.
--       라이브 코드(origin/main)의 /api/apply가 can_apply_today·increment_apply_count RPC를
--       호출 중이므로 §4(DROP)는 Phase 1 배포 직후 009b로 분리 실행한다.
-- 이 파일은 구(라이브) 코드와 100% 호환 — 언제든 안전하게 적용 가능. 멱등.
-- 적용: supabase db query --linked -f database/migrations/009a_renewal_additive.sql
-- ============================================

-- 1. profiles: 나이 → 출생연도 전환 (12_ia-userflows 정본)
alter table profiles
  add column if not exists birth_year integer
    check (birth_year is null or (birth_year >= 1940 and birth_year <= 2015));

-- 기존 age 데이터 백필 (만나이 가정: 출생연도 ≈ 현재연도 - 나이)
-- ⚠️ Phase 1 배포 시점에 이 UPDATE를 한 번 더 실행할 것 —
--    009a 적용 후에도 구 라이브 코드는 age만 쓰므로 그 사이 가입 유저는 birth_year가 null.
update profiles
set birth_year = extract(year from current_date)::integer - age
where birth_year is null and age is not null;

-- 신규 유저는 birth_year만 저장하므로 age 필수 해제 (컬럼은 호환용 유지)
alter table profiles alter column age drop not null;

-- 2. applications: 상태 모델 (F6)
alter table applications
  add column if not exists status text not null default 'sent'
    check (status in ('sent', 'failed', 'replied')),
  add column if not exists opened_at timestamptz; -- R1.2 open tracking 예약 (유저 노출 금지 — D2)

-- 3. bookmarks: 찜 (F6)
create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audition_id uuid not null references auditions(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, audition_id)
);

alter table bookmarks enable row level security;
drop policy if exists "본인 찜 조회" on bookmarks;
drop policy if exists "본인 찜 생성" on bookmarks;
drop policy if exists "본인 찜 삭제" on bookmarks;
create policy "본인 찜 조회" on bookmarks for select using (auth.uid() = user_id);
create policy "본인 찜 생성" on bookmarks for insert with check (auth.uid() = user_id);
create policy "본인 찜 삭제" on bookmarks for delete using (auth.uid() = user_id);
