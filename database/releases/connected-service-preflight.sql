-- Read-only. Apply schema 032..036 first. Do not output payloads or email addresses.
begin read only;
select a.status,count(*) as legacy_count,
 count(*) filter(where exists(select 1 from public.application_delivery_jobs j where j.application_id=a.id)) as with_job,
 count(*) filter(where not exists(select 1 from public.application_delivery_jobs j where j.application_id=a.id)) as without_job
from public.applications a where a.submission_snapshot is null and a.status in ('failed','sending') group by a.status;
-- Raises on unresolved legacy sends; do not cut over grants until this passes.
select public.assert_legacy_delivery_resolved();
select renderer_version, enabled, count(*) from public.profile_renderer_registry group by 1,2;
select count(*) as public_count, count(*) filter(where application_ready) as ready_count from public.public_auditions;
select grantee,table_name,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in ('auditions','profiles') and grantee in ('anon','authenticated');
select grantee,table_name,column_name,privilege_type from information_schema.role_column_grants
where table_schema='public' and table_name in ('auditions','profiles') and grantee in ('anon','authenticated');
-- Observed active writers only: zero here does NOT prove old callers have drained.
select pid,application_name,state,query_start from pg_stat_activity
where pid<>pg_backend_pid() and state='active' and query ~* '(insert into|update)[[:space:]]+(public\.)?profiles';
commit;
