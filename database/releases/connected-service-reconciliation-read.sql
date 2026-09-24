-- Read-only support inventory. Never include email payloads in exported reports.
begin read only;
select a.id as application_id,a.status,a.created_at,a.active_job_id
from public.applications a where a.submission_snapshot is null and a.status in ('failed','sending')
and not exists(select 1 from public.application_delivery_jobs j where j.application_id=a.id);
select j.id as job_id,j.application_id,j.state,j.mode,j.provider_id,j.created_at,j.dispatch_started_at,
 a.active_job_id=j.id as is_current,a.send_stopped,
 now()-j.created_at as age,j.created_at<now()-interval '23 hours' as replay_expired
from public.application_delivery_jobs j join public.applications a on a.id=j.application_id
where j.state in ('prepared','dispatching','uncertain') order by j.created_at;
select o.id as operation_id,o.user_id,o.created_at,l.deleting
from public.account_file_operations o join public.account_file_lifecycle l on l.user_id=o.user_id
order by o.created_at;
select count(*) as unmatched_events,min(e.received_at) as oldest
from public.application_delivery_events e
where not exists(select 1 from public.application_delivery_jobs j where j.provider_id=e.provider_id);
commit;
