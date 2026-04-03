-- ============================================
-- 마감 공고 자동 비활성화 (pg_cron)
-- Supabase SQL 편집기에서 실행
-- ============================================

-- 1. pg_cron 확장 활성화 (Supabase에서 기본 제공)
create extension if not exists pg_cron;

-- 2. 마감 공고 비활성화 함수
create or replace function deactivate_expired_auditions()
returns integer as $$
declare
  affected integer;
begin
  update auditions
  set is_active = false
  where is_active = true
    and deadline < current_date;

  get diagnostics affected = row_count;
  return affected;
end;
$$ language plpgsql security definer;

-- 3. 매일 KST 00:05 (UTC 15:05)에 자동 실행
select cron.schedule(
  'deactivate-expired-auditions',
  '5 15 * * *',
  $$select deactivate_expired_auditions()$$
);
