-- ============================================
-- 009b — 009_renewal_apply_flow §4 (DROP 분리본)
-- ⚠️ 실행 조건: Phase 1 배포(리뉴얼 코드 main 반영) "직후"에만.
--    구 라이브 코드의 POST /api/apply가 can_apply_today·increment_apply_count를
--    RPC로 호출하므로, 배포 전에 실행하면 라이브 원클릭 지원이 전면 중단된다.
-- 백업: 실행 전 daily_apply_count 덤프
--   supabase db query --linked "select * from daily_apply_count" > backup_daily_apply_count.json
-- 적용: supabase db query --linked -f database/migrations/009b_renewal_drop_apply_limit.sql
-- 근거: 00 D2 (지원 횟수 제한 폐지)
-- ============================================

-- Phase 1 배포 사이 가입 유저 백필 재실행 (009a 주석 참조)
update profiles
set birth_year = extract(year from current_date)::integer - age
where birth_year is null and age is not null;

drop function if exists can_apply_today(uuid);
drop function if exists increment_apply_count(uuid);
drop function if exists get_daily_apply_status(uuid);
drop table if exists daily_apply_count;
