-- Run only AFTER readiness checks confirm that 025, 026 and 027 exist.
-- Read-only aggregates and bucket configuration; never returns profile/payload values.
begin transaction read only;

select 'profiles_missing_current_snapshot' as check_item, count(*) as row_count
from public.profiles p left join public.profile_versions v
  on v.user_id = p.id and v.version = p.document_version
where v.id is null
union all
select 'current_snapshot_content_mismatch', count(*)
from public.profiles p join public.profile_versions v
  on v.user_id = p.id and v.version = p.document_version
where (v.profile - array['created_at','updated_at','document_version'])
  is distinct from (to_jsonb(p) - array['created_at','updated_at','document_version'])
union all
select 'application_snapshot_owner_mismatch', count(*)
from public.applications a join public.profile_versions v on v.id = a.profile_version_id
where a.user_id <> v.user_id
union all
-- Historical applications are intentionally nullable; this is informational.
select 'applications_without_snapshot_including_legacy', count(*)
from public.applications where profile_version_id is null
union all
-- Investigate through the approved reconciliation flow; do not reset sending blindly.
select 'sending_older_than_one_hour', count(*)
from public.applications where status = 'sending' and created_at < now() - interval '1 hour'
union all
select 'delivery_jobs_with_retained_payload', count(*)
from public.application_delivery_jobs where payload is not null;

select id, public, file_size_limit, allowed_mime_types,
  not public and file_size_limit = 3145728
    and allowed_mime_types = array['application/pdf']::text[] as expected_configuration
from storage.buckets where id = 'profile-documents';
commit;
