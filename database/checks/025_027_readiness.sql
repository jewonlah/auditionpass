-- Read-only metadata checks. Safe before or after 025 -> 026 -> 027.
-- Run as the database owner in the SQL editor. No private row values are returned.
-- A false result before deployment means the corresponding migration is pending.
begin transaction read only;

select '023 applications accepts sending' as check_item,
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
    and qual like '%profile-documents%' and with_check like '%profile-documents%');

-- Inspect policy expressions; names/presence alone do not prove ownership isolation.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in ('profiles','applications','application_delivery_jobs','profile_versions'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;
commit;
