select json_build_object(
  'materials_table', to_regclass('public.materials') is not null,
  'materials_rls', (select relrowsecurity from pg_class where oid='public.materials'::regclass),
  'owner_read_policy', exists(select 1 from pg_policies where schemaname='public' and tablename='materials' and policyname='materials_owner_read'),
  'client_insert_blocked', not has_table_privilege('authenticated','public.materials','insert'),
  'client_delete_blocked', not has_table_privilege('authenticated','public.materials','delete'),
  'anonymous_read_blocked', not has_table_privilege('anon','public.materials','select'),
  'private_bucket', (select not public and file_size_limit=3145728 from storage.buckets where id='materials'),
  'storage_restrictive_policy', exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='materials_server_only' and permissive='RESTRICTIVE'),
  'quota_trigger', exists(select 1 from pg_trigger where tgrelid='public.materials'::regclass and tgname='materials_quota' and tgenabled='O'),
  'profile_materials_fields', (select count(*)=4 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('training','introduction_url','performance_url','audio_url'))
) as checks;
