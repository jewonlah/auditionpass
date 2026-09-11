-- Read-only catalog checks, safe before/after 028. No account identifiers are emitted.
begin transaction read only;
select table_name,
  to_regclass('public.' || table_name) is not null as exists,
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || table_name)), false) as rls_enabled,
  to_regclass('public.' || table_name) is not null and not exists (
    select 1 from unnest(array['anon','authenticated']) as roles(role_name)
    where has_table_privilege(role_name, to_regclass('public.' || table_name), 'SELECT,INSERT,UPDATE,DELETE')
  ) as client_access_denied
from unnest(array['account_file_lifecycle','account_file_operations']) as tables(table_name);

select function_signature,
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
]) as functions(function_signature);

select 'tombstone_has_no_foreign_key' as check_item,
  to_regclass('public.account_file_lifecycle') is not null and not exists (
    select 1 from pg_constraint where conrelid = to_regclass('public.account_file_lifecycle') and contype = 'f'
  ) as ok;
commit;
