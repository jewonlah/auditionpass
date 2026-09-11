-- Combined result: the Management API returns only the last SELECT result.
begin transaction read only;
select jsonb_build_object(
'readiness_0', (select jsonb_agg(result_row) from (select '023 applications accepts sending' as check_item,
  exists (select 1 from pg_constraint where conrelid = to_regclass('public.applications')
    and contype = 'c' and pg_get_constraintdef(oid) like '%sending%') as ok
union all
select '025 delivery jobs RLS enabled', coalesce((select relrowsecurity from pg_class
  where oid = to_regclass('public.application_delivery_jobs')), false)
union all
select '025 clients cannot access delivery jobs',
  to_regclass('public.application_delivery_jobs') is not null
  and not exists (select 1 from unnest(array['anon','authenticated']) as roles(role_name)
    where has_table_privilege(role_name, to_regclass('public.application_delivery_jobs'), 'SELECT,INSERT,UPDATE,DELETE'))
union all
select '025 service can manage delivery jobs',
  coalesce(has_table_privilege('service_role', to_regclass('public.application_delivery_jobs'), 'SELECT'), false)
  and coalesce(has_table_privilege('service_role', to_regclass('public.application_delivery_jobs'), 'INSERT'), false)
  and coalesce(has_table_privilege('service_role', to_regclass('public.application_delivery_jobs'), 'UPDATE'), false)
union all
select '025 clients cannot write applications',
  to_regclass('public.applications') is not null
  and not exists (select 1 from unnest(array['anon','authenticated']) as roles(role_name)
    where has_table_privilege(role_name, to_regclass('public.applications'), 'INSERT,UPDATE,DELETE'))
union all
select '026 profile columns exist', (select count(*) = 2 from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name in ('template_id', 'document_version'))
union all
select '026 snapshot RLS enabled', coalesce((select relrowsecurity from pg_class
  where oid = to_regclass('public.profile_versions')), false)
union all
select '026 authenticated can read snapshots',
  coalesce(has_table_privilege('authenticated', to_regclass('public.profile_versions'), 'SELECT'), false)
union all
select '026 clients cannot write snapshots',
  to_regclass('public.profile_versions') is not null
  and not exists (select 1 from unnest(array['anon','authenticated']) as roles(role_name)
    where has_table_privilege(role_name, to_regclass('public.profile_versions'), 'INSERT,UPDATE,DELETE'))
union all
select '026 version triggers enabled', (select count(*) = 2 from pg_trigger
  where tgrelid = to_regclass('public.profiles') and not tgisinternal
    and tgname in ('profile_version_before','profile_version_after') and tgenabled in ('O','A'))
union all
select '026 application snapshot foreign key exists', exists (select 1 from pg_constraint
  where conrelid = to_regclass('public.applications') and contype = 'f'
    and confrelid = to_regclass('public.profile_versions') and confdeltype = 'n')
union all
select '027 restrictive PDF policy exists', exists (select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and permissive = 'RESTRICTIVE'
    and cmd = 'ALL' and roles @> array['anon','authenticated']::name[]
    and qual like '%profile-documents%' and with_check like '%profile-documents%')) result_row),
'readiness_1', (select jsonb_agg(result_row) from (select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('profiles','applications','application_delivery_jobs','profile_versions'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname) result_row),
'post_apply_0', (select jsonb_agg(result_row) from (select 'profiles_missing_current_snapshot' as check_item, count(*) as row_count
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

select 'applications_without_snapshot_including_legacy', count(*)
from public.applications where profile_version_id is null
union all

select 'sending_older_than_one_hour', count(*)
from public.applications where status = 'sending' and created_at < now() - interval '1 hour'
union all
select 'delivery_jobs_with_retained_payload', count(*)
from public.application_delivery_jobs where payload is not null) result_row),
'post_apply_1', (select jsonb_agg(result_row) from (select id, public, file_size_limit, allowed_mime_types,
  not public and file_size_limit = 3145728
    and allowed_mime_types = array['application/pdf']::text[] as expected_configuration
from storage.buckets where id = 'profile-documents') result_row),
'file_lifecycle_0', (select jsonb_agg(result_row) from (select table_name,
  to_regclass('public.' || table_name) is not null as exists,
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || table_name)), false) as rls_enabled,
  to_regclass('public.' || table_name) is not null and not exists (
    select 1 from unnest(array['anon','authenticated']) as roles(role_name)
    where has_table_privilege(role_name, to_regclass('public.' || table_name), 'SELECT,INSERT,UPDATE,DELETE')
  ) as client_access_denied
from unnest(array['account_file_lifecycle','account_file_operations']) as tables(table_name)) result_row),
'file_lifecycle_1', (select jsonb_agg(result_row) from (select function_signature,
  to_regprocedure(function_signature) is not null as exists,
  coalesce(has_function_privilege('service_role', to_regprocedure(function_signature), 'EXECUTE'), false) as service_can_execute,
  to_regprocedure(function_signature) is not null and not exists (
    select 1 from unnest(array['anon','authenticated']) as roles(role_name)
    where has_function_privilege(role_name, to_regprocedure(function_signature), 'EXECUTE')
  ) as client_execute_denied,
  coalesce((select prosecdef and proconfig @> array['search_path=""']::text[]
    from pg_proc where oid = to_regprocedure(function_signature)), false) as hardened_definer
from unnest(array[
  'public.begin_account_file_operation(uuid)',
  'public.finish_account_file_operation(uuid,uuid)',
  'public.begin_account_file_deletion(uuid)'
]) as functions(function_signature)) result_row),
'file_lifecycle_2', (select jsonb_agg(result_row) from (select 'tombstone_has_no_foreign_key' as check_item,
  to_regclass('public.account_file_lifecycle') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.account_file_lifecycle') and contype = 'f'
  ) as ok) result_row)
) as verification;
rollback;
