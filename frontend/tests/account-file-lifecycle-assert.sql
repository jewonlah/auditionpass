set role service_role;
do $$
declare token uuid;
begin
  token := public.begin_account_file_operation('11111111-1111-4111-8111-111111111111');
  if public.begin_account_file_deletion('11111111-1111-4111-8111-111111111111') then
    raise exception 'Deletion ignored active operation';
  end if;
  begin
    perform public.begin_account_file_operation('11111111-1111-4111-8111-111111111111');
    raise exception 'Deleting account accepted new operation';
  exception when sqlstate '55000' then null; end;
  perform public.finish_account_file_operation('22222222-2222-4222-8222-222222222222', token);
  if public.begin_account_file_deletion('11111111-1111-4111-8111-111111111111') then
    raise exception 'Wrong owner finished operation';
  end if;
  perform public.finish_account_file_operation('11111111-1111-4111-8111-111111111111', token);
  if not public.begin_account_file_deletion('11111111-1111-4111-8111-111111111111') then
    raise exception 'Completed operation still blocks deletion';
  end if;
end;
$$;
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if not exists(select 1 from public.account_file_lifecycle
    where user_id = '11111111-1111-4111-8111-111111111111' and deleting) then
    raise exception 'Deletion tombstone lost';
  end if;
  begin
    perform public.begin_account_file_operation('33333333-3333-4333-8333-333333333333');
    raise exception 'Missing auth user accepted';
  exception when sqlstate '55000' then null; end;
  if exists(select 1 from public.account_file_lifecycle where user_id = '33333333-3333-4333-8333-333333333333') then
    raise exception 'Failed operation did not roll back';
  end if;
end $$;
set role authenticated;
do $$ begin
  begin perform public.begin_account_file_deletion('22222222-2222-4222-8222-222222222222');
    raise exception 'Client invoked privileged function';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.account_file_operations;
    raise exception 'Client read operation tokens';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A second connection attempts creation while deletion owns the row lock.
create extension dblink;
select dblink_connect('file_worker', 'dbname=postgres user=postgres');
begin;
select public.begin_account_file_deletion('22222222-2222-4222-8222-222222222222');
select dblink_send_query('file_worker', 'select public.begin_account_file_operation(''22222222-2222-4222-8222-222222222222'')');
select pg_sleep(0.1);
do $$ begin
  if dblink_is_busy('file_worker') <> 1 then raise exception 'Operation did not wait for deletion lock'; end if;
end $$;
commit;
do $$ begin
  begin
    perform * from dblink_get_result('file_worker') as result(token uuid);
    raise exception 'Concurrent operation escaped deletion tombstone';
  exception when sqlstate '55000' then null; end;
end $$;
select dblink_disconnect('file_worker');
select 'PASS: active token drain, sticky tombstone, ownership, auth existence, client denial, concurrent deletion lock' as result;
