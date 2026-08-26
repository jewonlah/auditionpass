-- 010~016 적용 여부 실측 (어드민 R1 배포 게이트)
-- Supabase SQL 편집기에서 그대로 실행. ok=false 인 행이 아직 적용되지 않은 항목이다.
-- to_regclass()를 쓰므로 테이블이 없어도 에러 없이 false를 반환한다.

select '010 auditions.quality_score 존재' as check_item,
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='auditions' and column_name='quality_score') as ok
union all
select '010 crawl_logs.details 존재 (008 선행 필요)',
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='crawl_logs' and column_name='details')
union all
select '011 auditions.review_status 존재',
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='auditions' and column_name='review_status')
union all
select '011 trusted_sources 테이블 존재',
       to_regclass('public.trusted_sources') is not null
union all
select '011 source_candidates 테이블 존재',
       to_regclass('public.source_candidates') is not null
union all
select '012 review_status CHECK에 quarantine 포함',
       exists (select 1 from pg_constraint
               where conrelid = to_regclass('public.auditions')
                 and conname = 'auditions_review_status_check'
                 and pg_get_constraintdef(oid) like '%quarantine%')
union all
-- 013: 어드민 액션 로그 + undo. action CHECK에 merge/unpublish가 있어야 병합·게시중지가 기록된다.
select '013 admin_actions 테이블 존재',
       to_regclass('public.admin_actions') is not null
union all
select '013 admin_actions.action CHECK에 merge 포함',
       exists (select 1 from pg_constraint
               where conrelid = to_regclass('public.admin_actions')
                 and pg_get_constraintdef(oid) like '%merge%')
union all
select '013 admin_actions.action CHECK에 unpublish 포함',
       exists (select 1 from pg_constraint
               where conrelid = to_regclass('public.admin_actions')
                 and pg_get_constraintdef(oid) like '%unpublish%')
union all
-- 014: suppression 긴급 차단
select '014 suppression 테이블 존재',
       to_regclass('public.suppression') is not null
union all
select '014 suppression RLS 활성 (정책 없음 = service role 전용)',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.suppression')), false)
union all
-- 015: 신고 + 원클릭 차단 + 신뢰 배지용 집계
select '015 reports 테이블 존재',
       to_regclass('public.reports') is not null
union all
select '015 auditions.oneclick_blocked 존재',
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='auditions' and column_name='oneclick_blocked')
union all
select '015 auditions.reports_count 존재',
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='auditions' and column_name='reports_count')
union all
select '015 reports RLS 정책 2종(본인 조회·생성) 존재',
       (select count(*) from pg_policies
        where schemaname='public' and tablename='reports') >= 2
union all
select '015 reports 중복신고 방지 인덱스 존재',
       exists (select 1 from pg_indexes
               where schemaname='public' and tablename='reports'
                 and indexname='idx_reports_unique_reporter')
union all
-- 016: 신고 삽입은 서버(service role) 전용. INSERT 정책이 남아 있으면
-- 클라이언트가 /api/report의 등급·SLA·한도 검증을 우회할 수 있다.
select '016 reports INSERT 정책 제거됨 (서버 전용)',
       not exists (select 1 from pg_policies
                   where schemaname='public' and tablename='reports' and cmd='INSERT')
union all
select '016 reports SELECT 정책은 유지 (본인 신고 조회)',
       exists (select 1 from pg_policies
               where schemaname='public' and tablename='reports' and cmd='SELECT');
