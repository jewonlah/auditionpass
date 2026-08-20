-- ============================================
-- auditions HTML 엔티티 정정 (일회성 데이터 유지보수)
-- 근거: F10 — 프론트에 '&lt;우리별&gt;' 노출. 2026-08-21 실측 257행 오염.
--       크롤러 utils/supabase_client.py `_unescape` 도입과 세트 (신규 유입 차단).
-- 멱등: 엔티티 없는 행은 where로 제외, 재실행 무해.
-- 적용: supabase db query --linked -f database/maintenance/fix_html_entities.sql
-- ============================================

create or replace function pg_temp.decode_entities(t text) returns text
language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(t,
    '&amp;', '&'),
    '&lt;', '<'),
    '&gt;', '>'),
    '&quot;', '"'),
    '&#39;', ''''),
    '&#039;', ''''),
    '&nbsp;', ' ')
$$;

update auditions set
  title        = pg_temp.decode_entities(pg_temp.decode_entities(title)),
  company      = pg_temp.decode_entities(pg_temp.decode_entities(company)),
  description  = pg_temp.decode_entities(pg_temp.decode_entities(description)),
  requirements = pg_temp.decode_entities(pg_temp.decode_entities(requirements))
where title        ~ '&(amp|lt|gt|quot|#39|#039|nbsp);'
   or company      ~ '&(amp|lt|gt|quot|#39|#039|nbsp);'
   or description  ~ '&(amp|lt|gt|quot|#39|#039|nbsp);'
   or requirements ~ '&(amp|lt|gt|quot|#39|#039|nbsp);';

-- 검증: 잔여 오염 행 수 (기대값 0)
select count(*) as remaining
from auditions
where title       ~ '&(amp|lt|gt|quot|#39|#039|nbsp);'
   or company     ~ '&(amp|lt|gt|quot|#39|#039|nbsp);'
   or description ~ '&(amp|lt|gt|quot|#39|#039|nbsp);';
