create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
$$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
grant usage on schema public, auth to authenticated, service_role;
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

alter table profiles add column birth_year integer default 2000, add column age integer, add column gender text default '여성', add column height integer, add column weight integer, add column bio text, add column instagram_url text, add column youtube_url text, add column other_url text, add column activity_field text[] default '{}', add column agency text, add column specialty text[] default '{}', add column career text, add column phone text, add column training text, add column introduction_url text, add column performance_url text, add column audio_url text;
create table public.auditions(id uuid primary key, title text, description text, requirements text, apply_email text, deadline date, apply_type text, is_active boolean, oneclick_blocked boolean, source_name text, source_url text);
create table public.suppression(kind text, value text);

create table auth.users(id uuid primary key);
insert into auth.users select id from profiles;
alter table applications alter column id set default gen_random_uuid();
alter table applications add column audition_id uuid references auditions(id), add column status text default 'sending', add column email_sent boolean default false, add column created_at timestamptz default now(), add column sent_at timestamptz, add unique(user_id,audition_id);
create table public.materials(id uuid primary key,user_id uuid);

alter table auditions add column company text, add column genre text, add column category text, add column reports_count integer default 0, add column review_status text default 'auto', add column crawled_at timestamptz, add column created_at timestamptz default now(), add column quality_score integer;
create table bookmarks(id uuid primary key default gen_random_uuid(),user_id uuid,audition_id uuid,created_at timestamptz default now());
create table reports(id bigint,reporter_id uuid,audition_id uuid);
grant select on auditions to anon,authenticated;
