-- 009_renewal_apply_flow 적용 여부 확인 (마스터플랜 0-3 배포 게이트)
-- Supabase SQL 편집기에서 실행. 기대값: 아래 6행이 모두 true 이면 009 적용 완료.
select 'profiles.birth_year 존재'        as check_item,
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name='birth_year') as ok
union all
select 'profiles.age nullable',
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name='age' and is_nullable='YES')
union all
select 'applications.status 존재',
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='applications' and column_name='status')
union all
select 'applications.opened_at 존재',
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='applications' and column_name='opened_at')
union all
select 'bookmarks 테이블 존재',
       exists (select 1 from information_schema.tables
               where table_schema='public' and table_name='bookmarks')
union all
select 'daily_apply_count 삭제됨',
       not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name='daily_apply_count')
union all
select 'can_apply_today 함수 삭제됨',
       not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='can_apply_today');
