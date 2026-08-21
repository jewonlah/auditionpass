-- 007_category_system / 008_crawl_logs 적용 여부 확인 (30 마스터플랜 2-1 / 2-4 게이트)
-- 실행: supabase db query --linked -f database/checks/007_008_status.sql
-- 2026-08-21 실측: 라이브에 category 4컬럼·crawl_logs 모두 없음 (007·008 미적용)

-- 1) auditions.category 계열 4컬럼 — 4행이면 007 적용됨
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'auditions'
  and column_name in ('category', 'sub_category', 'category_confidence', 'classify_method')
order by column_name;

-- 2) genre CHECK — 007은 15종으로 확장. 3종이면 미적용
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.auditions'::regclass and conname = 'auditions_genre_check';

-- 3) crawl_logs 테이블 — null이면 008 미적용
select to_regclass('public.crawl_logs') as crawl_logs_table;

-- 4) (007 적용 후) 분류 실저장 현황
-- select category, classify_method, count(*), round(avg(category_confidence)::numeric, 2) as avg_conf
-- from auditions where is_active group by 1, 2 order by 3 desc;
