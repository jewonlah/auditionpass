-- Run after 025. Profile save + immutable snapshot are one database transaction.
begin;
alter table public.profiles add column if not exists template_id text not null default 'casting'
  check (template_id in ('casting', 'portfolio', 'career'));
alter table public.profiles add column if not exists document_version integer not null default 1;

create table if not exists public.profile_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  version integer not null check (version > 0),
  profile jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id, version)
);
alter table public.profile_versions enable row level security;
revoke all on public.profile_versions from anon, authenticated;
grant select on public.profile_versions to authenticated;
grant all on public.profile_versions to service_role;
create policy "본인 프로필 버전 조회" on public.profile_versions for select to authenticated using (auth.uid() = user_id);

-- Never accept the version number provided by a browser. The row lock serializes saves.
create or replace function public.assign_profile_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.document_version := 1;
  elsif (to_jsonb(NEW) - array['document_version','updated_at','created_at'])
      is distinct from (to_jsonb(OLD) - array['document_version','updated_at','created_at']) then
    NEW.document_version := OLD.document_version + 1;
  else
    NEW.document_version := OLD.document_version;
  end if;
  return NEW;
end;
$$;
create or replace function public.capture_profile_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile_versions(user_id, version, profile)
  values (NEW.id, NEW.document_version, to_jsonb(NEW)) on conflict(user_id, version) do nothing;
  return NEW;
end;
$$;
revoke all on function public.assign_profile_version() from public;
revoke all on function public.capture_profile_version() from public;
create trigger profile_version_before before insert or update on public.profiles
for each row execute function public.assign_profile_version();
create trigger profile_version_after after insert or update on public.profiles
for each row execute function public.capture_profile_version();

insert into public.profile_versions(user_id, version, profile)
select id, document_version, to_jsonb(p) from public.profiles p on conflict(user_id, version) do nothing;

alter table public.applications add column if not exists profile_version_id uuid
  references public.profile_versions(id) on delete set null;
create index if not exists applications_profile_version_idx on public.applications(profile_version_id);
commit;
