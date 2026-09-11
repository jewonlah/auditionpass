-- Apply after 027. Tombstones intentionally survive auth.users deletion.
-- Never expire operation tokens: reconcile interrupted work before removing a token.
begin;
create table public.account_file_lifecycle (
  user_id uuid primary key,
  deleting boolean not null default false
);
create table public.account_file_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.account_file_lifecycle(user_id),
  created_at timestamptz not null default now()
);
create index account_file_operations_user_idx on public.account_file_operations(user_id);
alter table public.account_file_lifecycle enable row level security;
alter table public.account_file_operations enable row level security;
revoke all on public.account_file_lifecycle, public.account_file_operations from public, anon, authenticated;
grant all on public.account_file_lifecycle, public.account_file_operations to service_role;

create or replace function public.begin_account_file_operation(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  is_deleting boolean;
  operation_id uuid;
begin
  insert into public.account_file_lifecycle(user_id) values (p_user_id) on conflict do nothing;
  select deleting into is_deleting from public.account_file_lifecycle where user_id = p_user_id for update;
  if is_deleting or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Account unavailable for file operations' using errcode = '55000';
  end if;
  insert into public.account_file_operations(user_id) values (p_user_id) returning id into operation_id;
  return operation_id;
end;
$$;

create or replace function public.finish_account_file_operation(p_user_id uuid, p_operation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.account_file_operations where id = p_operation_id and user_id = p_user_id;
end;
$$;

create or replace function public.begin_account_file_deletion(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_file_lifecycle(user_id) values (p_user_id) on conflict do nothing;
  perform 1 from public.account_file_lifecycle where user_id = p_user_id for update;
  update public.account_file_lifecycle set deleting = true where user_id = p_user_id;
  return not exists (select 1 from public.account_file_operations where user_id = p_user_id);
end;
$$;

revoke all on function public.begin_account_file_operation(uuid) from public, anon, authenticated;
revoke all on function public.finish_account_file_operation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_account_file_deletion(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_file_operation(uuid) to service_role;
grant execute on function public.finish_account_file_operation(uuid, uuid) to service_role;
grant execute on function public.begin_account_file_deletion(uuid) to service_role;
commit;
