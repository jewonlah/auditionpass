-- 90 A: reviewed pilot eligibility. No existing audition is silently marked reviewed.
begin;
create table if not exists public.audition_application_reviews (
 audition_id uuid primary key references public.auditions(id) on delete cascade,
 fingerprint text not null,
 min_age integer check(min_age between 0 and 120),
 max_age integer check(max_age between 0 and 120),
 minor_role boolean not null,
 required_materials text[] not null default '{}',
 reviewed_by text not null,
 reviewed_at timestamptz not null default now(),
 check(min_age is null or max_age is null or min_age <= max_age)
);
alter table public.audition_application_reviews enable row level security;
revoke all on public.audition_application_reviews from public,anon,authenticated;
grant all on public.audition_application_reviews to service_role;

create or replace function public.application_source_fingerprint(a public.auditions) returns text
language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(a.title,a.company,a.source_url,a.source_name,a.description,to_jsonb(a)->>'description_raw',a.requirements,a.apply_email,a.deadline,a.apply_type)::text);
$$;
revoke all on function public.application_source_fingerprint(public.auditions) from public,anon,authenticated;
grant execute on function public.application_source_fingerprint(public.auditions) to service_role;

create or replace function public.private_application_audition_gate(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.auditions; r public.audition_application_reviews;
begin
 if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into a from public.auditions where id=p_id;
 if not found or not a.is_active or a.review_status not in ('auto','approved') or a.oneclick_blocked or (a.deadline is not null and a.deadline < (now() at time zone 'Asia/Seoul')::date) then
   return jsonb_build_object('ready',false,'code','NOT_ACTIVE');
 end if;
 if a.apply_type <> 'email' or coalesce(a.apply_email,'')='' then return jsonb_build_object('ready',false,'code','EXTERNAL'); end if;
 if exists(select 1 from public.suppression s where
  (s.kind='email' and lower(a.apply_email)=lower(s.value)) or
  (s.kind='source' and coalesce(a.source_name,'') ilike s.value||'%') or
  (s.kind='domain' and (lower(a.apply_email) like '%@'||lower(s.value) or lower(coalesce(a.source_url,'')) like '%'||lower(s.value)||'%')))
 then return jsonb_build_object('ready',false,'code','ONECLICK_BLOCKED'); end if;
 select * into r from public.audition_application_reviews where audition_id=p_id;
 if not found or r.fingerprint <> public.application_source_fingerprint(a) then
   return jsonb_build_object('ready',false,'code','REQUIREMENTS_UNVERIFIED');
 end if;
 return jsonb_build_object('ready',not r.minor_role,'code',case when r.minor_role then 'MINOR_ROLE' else 'READY' end,
   'requirements',jsonb_build_object('minAge',r.min_age,'maxAge',r.max_age,'minorRole',r.minor_role,'requiredMaterials',r.required_materials),
   'fingerprint',r.fingerprint);
end; $$;
revoke all on function public.private_application_audition_gate(uuid) from public,anon,authenticated;
grant execute on function public.private_application_audition_gate(uuid) to service_role;

-- Public eligibility contains no server-only source fingerprint.
create or replace function public.application_audition_gate(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.private_application_audition_gate(p_id) - 'fingerprint';
$$;
revoke all on function public.application_audition_gate(uuid) from public,anon;
grant execute on function public.application_audition_gate(uuid) to authenticated,service_role;

create or replace function public.private_application_destination(p_id uuid,p_fingerprint text) returns text
language sql stable security definer set search_path='' as $$
 select a.apply_email from public.auditions a where a.id=p_id and a.is_active and not a.oneclick_blocked
 and a.review_status in ('auto','approved') and public.application_source_fingerprint(a)=p_fingerprint;
$$;
revoke all on function public.private_application_destination(uuid,text) from public,anon,authenticated;
grant execute on function public.private_application_destination(uuid,text) to service_role;
-- PostgREST computed field: list filters and badges use the same reviewed cohort.
create or replace function public.application_ready(a public.auditions) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.auditions live join public.audition_application_reviews r on r.audition_id=live.id
 where live.id=a.id and live.is_active and not coalesce(live.oneclick_blocked,true)
 and (live.deadline is null or live.deadline >= (now() at time zone 'Asia/Seoul')::date)
 and live.apply_type='email' and nullif(live.apply_email,'') is not null
 and r.fingerprint=public.application_source_fingerprint(live) and not r.minor_role and cardinality(r.required_materials)=0
 and not exists(select 1 from public.suppression s where
 (s.kind='email' and lower(live.apply_email)=lower(s.value)) or
 (s.kind='source' and coalesce(live.source_name,'') ilike s.value||'%') or
 (s.kind='domain' and (lower(live.apply_email) like '%@'||lower(s.value) or lower(coalesce(live.source_url,'')) like '%'||lower(s.value)||'%'))));
$$;
revoke all on function public.application_ready(public.auditions) from public;
grant execute on function public.application_ready(public.auditions) to anon,authenticated,service_role;
commit;
