create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema public, auth to authenticated;
create table public.profiles (
  id uuid primary key, name text, genre text[], photo_urls text[],
  updated_at timestamptz default now(), created_at timestamptz default now()
);
create table public.applications (
  id uuid primary key, user_id uuid references profiles(id) on delete cascade
);
insert into profiles(id,name,genre) values
('11111111-1111-4111-8111-111111111111', 'Original', array['성우']),
('22222222-2222-4222-8222-222222222222', 'Other user', array['배우']);
grant select, insert, update on profiles to authenticated;
alter table profiles enable row level security;
create policy own_profile on profiles to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key, bucket_id text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, service_role;
grant all on storage.objects to authenticated, service_role;
create policy broad_existing_policy on storage.objects for all to authenticated using (true) with check (true);
