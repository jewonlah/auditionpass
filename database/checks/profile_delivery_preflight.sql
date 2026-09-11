-- Read-only deployment preflight for 023, 025, 026 and 027.
-- Returns schema/policy metadata and aggregate counts only; no personal data.
begin transaction read only;
select jsonb_build_object(
  'migrations', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'tables', (select jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('profiles','applications','profile_versions','application_delivery_jobs')),
  'columns', (select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type))
    from information_schema.columns where table_schema = 'public'
    and ((table_name = 'profiles' and column_name in ('template_id','document_version'))
      or (table_name = 'applications' and column_name in ('status','profile_version_id')))),
  'constraints', (select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'definition', pg_get_constraintdef(oid)))
    from pg_constraint where conrelid in ('public.profiles'::regclass, 'public.applications'::regclass)),
  'policies', (select jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename, 'name', policyname,
    'roles', roles, 'command', cmd, 'permissive', permissive, 'using', qual, 'check', with_check))
    from pg_policies where (schemaname = 'public' and tablename in ('profiles','applications','profile_versions','application_delivery_jobs'))
    or (schemaname = 'storage' and tablename = 'objects')),
  'grants', (select jsonb_agg(jsonb_build_object('table', table_name, 'role', grantee, 'privilege', privilege_type))
    from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ('applications','profile_versions','application_delivery_jobs')
    and grantee in ('anon','authenticated','service_role')),
  'triggers', (select jsonb_agg(jsonb_build_object('name', tgname, 'definition', pg_get_triggerdef(oid)))
    from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal),
  'buckets', (select jsonb_agg(jsonb_build_object('id', id, 'public', public, 'limit', file_size_limit, 'mime_types', allowed_mime_types))
    from storage.buckets where id in ('profiles','profile-documents')),
  'profile_count', (select count(*) from public.profiles),
  'application_status_counts', (select jsonb_object_agg(status, total) from
    (select status, count(*) as total from public.applications group by status) counts)
) as preflight;
rollback;
