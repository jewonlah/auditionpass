-- 90: additive preparation only. Apply after 030; back up profiles/profile_versions first.
-- Does not UPDATE existing profiles or rewrite historical PDF objects.
begin;
alter table public.profiles add column if not exists renderer_version text not null default 'legacy-v1';
alter table public.profiles add column if not exists template_variant text not null default 'actor';
alter table public.profiles add column if not exists education text;
alter table public.profiles add column if not exists awards text;
alter table public.profiles add column if not exists guardian_name text;
alter table public.profiles add column if not exists guardian_phone text;
alter table public.profile_versions add column if not exists renderer_version text not null default 'legacy-v1';
alter table public.profiles drop constraint if exists profiles_template_id_check;
alter table public.profiles add constraint profiles_template_id_check check (template_id in ('casting','portfolio','career','classic','cinema','magazine','cozy','dignity'));
create table if not exists public.profile_renderer_registry (
  template_id text primary key, renderer_version text not null, enabled boolean not null default false
);
alter table public.profile_renderer_registry enable row level security;
revoke all on public.profile_renderer_registry from public, anon, authenticated;
grant all on public.profile_renderer_registry to service_role;
insert into public.profile_renderer_registry(template_id,renderer_version,enabled) values
 ('casting','legacy-v1',true),('portfolio','legacy-v1',true),('career','legacy-v1',true),
 ('classic','compcard-v1',false),('cinema','compcard-v1',false),('magazine','compcard-v1',false),('cozy','compcard-v1',false),('dignity','compcard-v1',false)
on conflict do nothing;

-- Also protect the compatibility interval before direct table grants are revoked.
create or replace function public.enforce_profile_renderer() returns trigger
language plpgsql security definer set search_path='' as $$
declare expected text;
begin
 if TG_OP='UPDATE' and new.template_id is not distinct from old.template_id and new.renderer_version is not distinct from old.renderer_version then return new; end if;
 select renderer_version into expected from public.profile_renderer_registry where template_id=new.template_id and enabled;
 if expected is null then raise exception 'TEMPLATE_NOT_READY'; end if;
 if new.renderer_version is distinct from expected then raise exception 'RENDERER_MISMATCH'; end if;
 return new;
end; $$;
revoke all on function public.enforce_profile_renderer() from public,anon,authenticated;
drop trigger if exists profile_renderer_before on public.profiles;
create trigger profile_renderer_before before insert or update on public.profiles for each row execute function public.enforce_profile_renderer();

create or replace function public.capture_profile_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile_versions(user_id,version,profile,renderer_version)
  values(NEW.id,NEW.document_version,to_jsonb(NEW),NEW.renderer_version) on conflict(user_id,version) do nothing;
  return NEW;
end; $$;

create or replace function public.available_profile_templates() returns table(template_id text)
language sql stable security definer set search_path = '' as $$
 select r.template_id from public.profile_renderer_registry r where r.enabled and auth.uid() is not null;
$$;
revoke all on function public.available_profile_templates() from public, anon;
grant execute on function public.available_profile_templates() to authenticated;

create or replace function public.save_profile_document(p_fields jsonb, p_create boolean default false)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); existing public.profiles; incoming public.profiles; result public.profiles;
  merged jsonb; renderer text; allowed text[] := array['template_id','template_variant','name','birth_year','age','gender','height','weight','bio','photo_urls','instagram_url','youtube_url','other_url','genre','activity_field','phone','agency','specialty','career','training','introduction_url','performance_url','audio_url','education','awards','guardian_name','guardian_phone'];
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_fields) <> 'object' or exists(select 1 from jsonb_object_keys(p_fields) k where not k = any(allowed)) then
    raise exception 'INVALID_PROFILE' using errcode='22023';
  end if;
  -- Serialize concurrent creates as well as saves, without a caller-supplied owner.
  insert into public.account_file_lifecycle(user_id) values(uid) on conflict do nothing;
  perform 1 from public.account_file_lifecycle where user_id=uid and not deleting for update;
  if not found then raise exception 'ACCOUNT_DELETING'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 31));
  select * into existing from public.profiles where id=uid for update;
  if p_create and existing.id is not null then raise unique_violation using message='PROFILE_EXISTS'; end if;
  if not p_create and existing.id is null then raise exception 'PROFILE_NOT_FOUND' using errcode='P0002'; end if;
  merged := (case when existing.id is null then '{}'::jsonb else to_jsonb(existing) end) || p_fields || jsonb_build_object('id',uid);
  if existing.id is null then merged := jsonb_build_object('template_id','casting','template_variant','actor','genre',jsonb_build_array(),'activity_field',jsonb_build_array(),'specialty',jsonb_build_array(),'photo_urls',jsonb_build_array()) || merged; end if;
  incoming := jsonb_populate_record(null::public.profiles,merged);
  if existing.id is not null and incoming.template_id=existing.template_id then
    renderer := existing.renderer_version;
  else
    select r.renderer_version into renderer from public.profile_renderer_registry r where r.template_id=incoming.template_id and r.enabled;
  end if;
  if renderer is null then raise exception 'TEMPLATE_NOT_READY' using errcode='22023'; end if;
  if incoming.template_variant is null or incoming.template_variant not in ('actor','model') or length(trim(coalesce(incoming.name,''))) not between 1 and 20
     or incoming.birth_year is null or incoming.birth_year < 1940 or incoming.birth_year > extract(year from current_date)::int - 14
     or incoming.gender is null or incoming.gender not in ('남성','여성','기타') or coalesce(cardinality(incoming.genre),0)=0
     or coalesce(cardinality(incoming.photo_urls),0)>5 or coalesce(cardinality(incoming.specialty),0)>3
     or length(coalesce(incoming.bio,''))>100 or length(coalesce(incoming.career,''))>500
     or length(coalesce(incoming.training,''))>500 or length(coalesce(incoming.education,''))>500
     or length(coalesce(incoming.awards,''))>500 or length(coalesce(incoming.phone,''))>20
     or length(coalesce(incoming.guardian_name,''))>50 or length(coalesce(incoming.guardian_phone,''))>20
  then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
  if incoming.height is not null and incoming.height not between 100 and 250
    or incoming.weight is not null and incoming.weight not between 30 and 200
    or length(coalesce(incoming.agency,''))>50
    or exists(select 1 from unnest(incoming.specialty) v where length(v)>30)
    or exists(select 1 from unnest(incoming.genre) v where v is null or v<>all(array['배우','모델','아이돌','키즈모델','가수','트로트','촬영모델','뮤지컬','연극','성우','댄서','MC/진행자','엑스트라','인플루언서']))
    or exists(select 1 from unnest(array[incoming.instagram_url,incoming.youtube_url,incoming.other_url,incoming.introduction_url,incoming.performance_url,incoming.audio_url]) v where nullif(v,'') is not null and (v !~ '^https?://' or length(v)>2048))
  then raise exception 'INVALID_PROFILE' using errcode='22023'; end if;
  -- Direct RPC calls cannot reference another member's storage photo.
  if exists(select 1 from unnest(incoming.photo_urls) u where u !~ ('^https://[^/]+/storage/v1/object/public/profiles/'||uid::text||'/[^?#]+$')) then
    raise exception 'INVALID_PHOTO_OWNER' using errcode='42501';
  end if;
  if existing.id is not null then
    update public.profiles set template_id=incoming.template_id,template_variant=incoming.template_variant,renderer_version=renderer,name=incoming.name,birth_year=incoming.birth_year,age=incoming.age,gender=incoming.gender,height=incoming.height,weight=incoming.weight,bio=incoming.bio,photo_urls=incoming.photo_urls,instagram_url=incoming.instagram_url,youtube_url=incoming.youtube_url,other_url=incoming.other_url,genre=incoming.genre,activity_field=incoming.activity_field,phone=incoming.phone,agency=incoming.agency,specialty=incoming.specialty,career=incoming.career,training=incoming.training,introduction_url=incoming.introduction_url,performance_url=incoming.performance_url,audio_url=incoming.audio_url,education=incoming.education,awards=incoming.awards,guardian_name=incoming.guardian_name,guardian_phone=incoming.guardian_phone where id=uid returning * into result;
  else
  insert into public.profiles(id,template_id,template_variant,renderer_version,name,birth_year,age,gender,height,weight,bio,photo_urls,instagram_url,youtube_url,other_url,genre,activity_field,phone,agency,specialty,career,training,introduction_url,performance_url,audio_url,education,awards,guardian_name,guardian_phone)
  values(uid,incoming.template_id,incoming.template_variant,renderer,incoming.name,incoming.birth_year,incoming.age,incoming.gender,incoming.height,incoming.weight,incoming.bio,incoming.photo_urls,incoming.instagram_url,incoming.youtube_url,incoming.other_url,incoming.genre,incoming.activity_field,incoming.phone,incoming.agency,incoming.specialty,incoming.career,incoming.training,incoming.introduction_url,incoming.performance_url,incoming.audio_url,incoming.education,incoming.awards,incoming.guardian_name,incoming.guardian_phone)
    returning * into result;
  end if;
  return result;
end; $$;
revoke all on function public.save_profile_document(jsonb,boolean) from public, anon;
grant execute on function public.save_profile_document(jsonb,boolean) to authenticated;
commit;
-- Activation is a separate owner-approved operation after every app instance uses RPC.
-- Then revoke direct profiles INSERT/UPDATE grants (including column grants), verify all
-- three save callers, and enable compcard registry rows. Never deploy this as automatic DML.
