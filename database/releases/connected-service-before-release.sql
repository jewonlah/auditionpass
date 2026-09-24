-- Read-only BEFORE 032..036. Export counts only; no contact data or payloads.
begin read only;
select status,count(*) as application_count,
 count(*) filter(where exists(select 1 from public.application_delivery_jobs j where j.application_id=a.id)) as with_job,
 count(*) filter(where not exists(select 1 from public.application_delivery_jobs j where j.application_id=a.id)) as without_job
from public.applications a group by status order by status;
select a.status,count(*) as job_count,
 count(*) filter(where j.provider_id is not null) as with_provider_receipt,
 min(j.created_at) as oldest_job
from public.application_delivery_jobs j join public.applications a on a.id=j.application_id
group by a.status order by a.status;
select template_id,count(*) from public.profiles group by template_id;
select table_name,column_name from information_schema.columns where table_schema='public'
and ((table_name='profiles' and column_name='renderer_version') or (table_name='applications' and column_name='submission_snapshot'));
select grantee,table_name,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in ('auditions','profiles') and grantee in ('anon','authenticated');
commit;
