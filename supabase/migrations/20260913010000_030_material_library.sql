begin;
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  kind text not null check (kind in ('photo','document','video','audio')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm','audio/mpeg','audio/wav')),
  size_bytes integer not null check (size_bytes between 1 and 3145728),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint materials_owned_path check (storage_path ~ ('^' || user_id::text || '/' || id::text || '\.[a-z0-9]+$'))
);
create index materials_user_created on public.materials(user_id, created_at desc, id desc);
alter table public.materials enable row level security;
revoke all on public.materials from anon, authenticated;
grant select on public.materials to authenticated;
grant all on public.materials to service_role;
create policy materials_owner_read on public.materials for select to authenticated using (user_id = (select auth.uid()));

-- Serialize reservations per account so parallel requests cannot exceed the quota.
create function public.enforce_material_quota() returns trigger language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 30));
  if (select count(*) from public.materials where user_id = new.user_id) >= 100 then
    raise exception 'Material quota reached' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_material_quota() from public, anon, authenticated;
create trigger materials_quota before insert on public.materials for each row execute function public.enforce_material_quota();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('materials','materials',false,3145728,array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm','audio/mpeg','audio/wav'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy materials_server_only on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'materials') with check (bucket_id <> 'materials');
commit;
