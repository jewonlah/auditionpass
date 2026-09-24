-- 103. Back up profiles/profile_versions/applications/jobs before cutover.
-- Pause all send callers and drain before applying. Never roll back to the old sender.
begin;
lock table public.submission_preparations,public.application_delivery_jobs in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.application_delivery_jobs where state in ('prepared','dispatching','uncertain')) or
 exists(select 1 from public.submission_preparations where state='active' and expires_at>now())
 then raise exception 'REQUIREMENTS_CUTOVER_REQUIRES_DRAIN'; end if;
end $$;
create or replace function public.valid_application_acknowledgements(items text[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(cardinality(items)<=10 and (cardinality(items)=0 or array_ndims(items)=1)
 and cardinality(items)=(select count(distinct v) from unnest(items) v)
 and not exists(select 1 from unnest(items) v where v is null or length(v) not between 1 and 300 or v !~ '[^[:space:]]' or v ~ '^[[:space:]]|[[:space:]]$'),false);
$$;
revoke all on function public.valid_application_acknowledgements(text[]) from public,anon,authenticated;
grant execute on function public.valid_application_acknowledgements(text[]) to service_role;
alter table public.audition_application_reviews
 add column if not exists required_gender text,
 add column if not exists require_career boolean not null default false,
 add column if not exists acknowledgements text[] not null default '{}',
 add column if not exists age_scope text not null default 'source';
alter table public.audition_application_reviews drop constraint if exists reviewed_requirement_contract;
alter table public.audition_application_reviews add constraint reviewed_requirement_contract check(
 (required_gender is null or required_gender in ('남성','여성')) and age_scope in ('source','pilot')
 and public.valid_application_acknowledgements(acknowledgements));

create or replace function public.application_review_fingerprint(r public.audition_application_reviews) returns text
language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(r.fingerprint,r.min_age,r.max_age,r.minor_role,to_jsonb(r.required_materials),r.subject_format,to_jsonb(r.subject_roles),r.required_gender,r.require_career,to_jsonb(r.acknowledgements),r.age_scope)::text);
$$;

-- Profile comes from the owned immutable version, never from browser snapshot metadata.
create or replace function public.application_requirements_snapshot_valid(rules jsonb,snap jsonb,profile jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare yr integer:=extract(year from now() at time zone 'Asia/Seoul'); upper_age integer;
begin
 if jsonb_typeof(rules) is distinct from 'object' or jsonb_typeof(profile) is distinct from 'object' or
 snap->'requirementsVersion' is distinct from '1'::jsonb or
 jsonb_typeof(rules->'acknowledgements') is distinct from 'array' or
 snap->'acceptedAcknowledgements' is distinct from rules->'acknowledgements' then return false; end if;
 if rules->'minorRole' is distinct from 'false'::jsonb or rules->'requiredMaterials' is distinct from '[]'::jsonb then return false; end if;
 if not (rules ? 'requiredGender') or jsonb_typeof(rules->'requireCareer') is distinct from 'boolean' or
 rules->>'ageScope' not in ('source','pilot') then return false; end if;
 if rules->>'requiredGender' is not null and profile->>'gender' is distinct from rules->>'requiredGender' then return false; end if;
 if rules->'requireCareer'='true'::jsonb and (jsonb_typeof(profile->'career') is distinct from 'string' or coalesce(profile->>'career','') !~ '[^[:space:]]') then return false; end if;
 if jsonb_typeof(profile->'birth_year') is distinct from 'number' or (profile->>'birth_year') !~ '^[0-9]{4}$' then return false; end if;
 upper_age:=yr-(profile->>'birth_year')::integer;
 if upper_age-1<19 or (rules->>'minAge' is not null and upper_age-1<(rules->>'minAge')::integer) or
 (rules->>'maxAge' is not null and upper_age>(rules->>'maxAge')::integer) then return false; end if;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;
revoke all on function public.application_requirements_snapshot_valid(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.application_requirements_snapshot_valid(jsonb,jsonb,jsonb) to service_role;

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
   'requirements',jsonb_build_object('minAge',r.min_age,'maxAge',r.max_age,'minorRole',r.minor_role,'requiredMaterials',r.required_materials,'requiredGender',r.required_gender,'requireCareer',r.require_career,'acknowledgements',r.acknowledgements,'ageScope',r.age_scope),
   'subjectRules',jsonb_build_object('format',r.subject_format,'roles',r.subject_roles),
   'fingerprint',public.application_review_fingerprint(r));
end; $$;

create or replace function public.private_application_destination(p_id uuid,p_fingerprint text) returns text
language sql stable security definer set search_path='' as $$
 select a.apply_email from public.auditions a cross join lateral public.private_application_audition_gate(a.id) gate
 where a.id=p_id and (gate->>'ready')::boolean is true and gate->>'fingerprint'=p_fingerprint;
$$;

create or replace function public.claim_submission_preparation(p_id uuid,p_consent boolean) returns public.application_delivery_jobs
language plpgsql security definer set search_path='' as $$
declare prep public.submission_preparations; app public.applications; job public.application_delivery_jobs; uid uuid:=auth.uid(); gate jsonb; is_deleting boolean;
begin
 if uid is null or p_consent is distinct from true then raise exception 'CONSENT_REQUIRED' using errcode='42501'; end if;
 insert into public.account_file_lifecycle(user_id) values(uid) on conflict do nothing;
 select deleting into is_deleting from public.account_file_lifecycle where user_id=uid for update;
 if is_deleting then raise exception 'ACCOUNT_DELETING'; end if;
 select * into prep from public.submission_preparations where id=p_id and user_id=uid for update;
 if not found or prep.state<>'active' or prep.expires_at<=now() then raise exception 'PREPARATION_EXPIRED'; end if;
 if exists(select 1 from public.account_file_operations where user_id=uid) then raise exception 'FILE_OPERATION_PENDING'; end if;
 -- Take row locks BEFORE reading the gate in a separate statement.
 perform 1 from public.auditions where id=prep.audition_id for share;
 perform 1 from public.audition_application_reviews where audition_id=prep.audition_id for share;
 if not found then raise exception 'AUDITION_CHANGED'; end if;
 gate:=public.private_application_audition_gate(prep.audition_id);
 if coalesce((gate->>'ready')::boolean,false)=false or (gate->>'fingerprint') is distinct from prep.fingerprint then raise exception 'AUDITION_CHANGED'; end if;
 if gate#>>'{subjectRules,format}'='role_name_age_phone_v1' and
   (prep.snapshot->'subjectYear') is distinct from to_jsonb(extract(year from now() at time zone 'Asia/Seoul')::integer)
 then raise exception 'PREPARATION_EXPIRED'; end if;
 if not public.application_subject_snapshot_valid(gate->'subjectRules',prep.snapshot,prep.payload) then raise exception 'PREPARATION_CHANGED'; end if;
 if not exists(select 1 from public.profile_versions v where v.id=prep.profile_version_id and v.user_id=uid
 and public.application_requirements_snapshot_valid(gate->'requirements',prep.snapshot,v.profile)) then raise exception 'PREPARATION_CHANGED'; end if;
 if not exists(select 1 from public.profile_versions v join public.profiles p on p.id=v.user_id and p.document_version=v.version where v.id=prep.profile_version_id and v.user_id=uid) then raise exception 'PROFILE_CHANGED'; end if;
 if exists(select 1 from unnest(prep.material_ids) as selected(material_id) where not exists(select 1 from public.materials m where m.id=selected.material_id and m.user_id=uid)) then raise exception 'MATERIAL_CHANGED'; end if;
 perform 1 from public.materials where id=any(prep.material_ids) and user_id=uid for share;
 select * into app from public.applications where user_id=uid and audition_id=prep.audition_id for update;
 if app.send_stopped then raise exception 'SEND_STOPPED'; end if;
 if found and app.status<>'failed' then raise exception 'ALREADY_APPLIED'; end if;
 if app.id is not null and exists(select 1 from public.application_delivery_jobs j where j.application_id=app.id and j.state not in ('rejected','cancelled')) then raise exception 'APPLY_IN_PROGRESS'; end if;
 if app.id is null then
  insert into public.applications(user_id,audition_id,status,email_sent,profile_version_id,submission_snapshot)
  values(uid,prep.audition_id,'sending',false,prep.profile_version_id,prep.snapshot - 'fingerprint') returning * into app;
 else
  update public.applications set status='sending',email_sent=false,profile_version_id=prep.profile_version_id,submission_snapshot=prep.snapshot - 'fingerprint',delivery_status='unknown' where id=app.id returning * into app;
 end if;
 insert into public.application_delivery_jobs(application_id,payload,mode,state) values(app.id,prep.payload,prep.mode,'prepared') returning * into job;
 update public.applications set active_job_id=job.id where id=app.id;
 insert into public.application_consents(application_id,job_id,user_id,preparation_id,wording_version,snapshot)
 values(app.id,job.id,uid,prep.id,prep.snapshot->>'wordingVersion',prep.snapshot);
 update public.submission_preparations set state='used',payload='{}' where id=prep.id;
 return job;
end; $$;

create or replace function public.legacy_application_recovery_allowed(p_job uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.application_delivery_jobs j join public.applications x on x.id=j.application_id join public.auditions a on a.id=x.audition_id
 where j.id=p_job and x.user_id=p_user and x.active_job_id=j.id and x.submission_snapshot is null
 and j.created_at>now()-interval '23 hours' and j.payload is not null and a.is_active and a.review_status in ('auto','approved') and not a.oneclick_blocked
 and (a.deadline is null or a.deadline>=(now() at time zone 'Asia/Seoul')::date) and a.apply_type='email'
 and (j.mode='test' or lower(j.payload->>'to')=lower(a.apply_email))
 and not exists(select 1 from public.audition_application_reviews r where r.audition_id=a.id and (r.minor_role or r.subject_format<>'standard' or cardinality(r.required_materials)>0 or r.required_gender is not null or r.require_career or cardinality(r.acknowledgements)>0 or r.age_scope='pilot'))
 and not exists(select 1 from public.suppression s where
 (s.kind='email' and lower(a.apply_email)=lower(s.value)) or (s.kind='source' and coalesce(a.source_name,'') ilike s.value||'%') or
 (s.kind='domain' and (lower(a.apply_email) like '%@'||lower(s.value) or lower(coalesce(a.source_url,'')) like '%'||lower(s.value)||'%'))));
$$;

create or replace function public.acquire_application_dispatch(p_job uuid,p_user uuid) returns public.application_delivery_jobs
language plpgsql security definer set search_path='' as $$
declare j public.application_delivery_jobs; deleting boolean; app public.applications; gate jsonb; snap jsonb;
begin
 insert into public.account_file_lifecycle(user_id) values(p_user) on conflict do nothing;
 select l.deleting into deleting from public.account_file_lifecycle l where user_id=p_user for update;
 if not found or deleting then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
 select d.* into j from public.application_delivery_jobs d join public.applications a on a.id=d.application_id
 where d.id=p_job and a.user_id=p_user and a.active_job_id=d.id for update of d;
 if not found then raise exception 'JOB_UNAVAILABLE'; end if;
 if j.provider_id is not null then return j; end if;
 if j.state not in ('prepared','uncertain') and not (j.state='dispatching' and coalesce(j.dispatch_started_at,j.created_at)<now()-interval '3 minutes') then raise exception 'JOB_IN_PROGRESS'; end if;
 if j.created_at<now()-interval '23 hours' then raise exception 'MANUAL_REVIEW'; end if;
 select * into app from public.applications where id=j.application_id;
 if app.submission_snapshot is null then
  if not public.legacy_application_recovery_allowed(j.id,p_user) then raise exception 'MANUAL_REVIEW:AUDITION_CHANGED'; end if;
 else
  perform 1 from public.auditions where id=app.audition_id for share;
  perform 1 from public.audition_application_reviews where audition_id=app.audition_id for share;
  if not found then raise exception 'MANUAL_REVIEW:AUDITION_CHANGED'; end if;
  gate:=public.private_application_audition_gate(app.audition_id);
  select snapshot into snap from public.application_consents where job_id=j.id and user_id=p_user;
  if coalesce((gate->>'ready')::boolean,false)=false or (gate->>'fingerprint') is distinct from (snap->>'fingerprint') then
   raise exception 'MANUAL_REVIEW:AUDITION_CHANGED';
  end if;
  if gate#>>'{subjectRules,format}'='role_name_age_phone_v1' and
    (snap->'subjectYear') is distinct from to_jsonb(extract(year from now() at time zone 'Asia/Seoul')::integer)
  then raise exception 'MANUAL_REVIEW:SUBJECT_YEAR_CHANGED'; end if;
  if not public.application_subject_snapshot_valid(gate->'subjectRules',snap,j.payload) then raise exception 'MANUAL_REVIEW:PREPARATION_CHANGED'; end if;
  if not exists(select 1 from public.profile_versions v where v.id=app.profile_version_id and v.user_id=p_user
   and public.application_requirements_snapshot_valid(gate->'requirements',snap,v.profile)) then raise exception 'MANUAL_REVIEW:PREPARATION_CHANGED'; end if;
 end if;
 update public.application_delivery_jobs set state='dispatching',dispatch_started_at=now() where id=j.id returning * into j;
 return j;
end; $$;

commit;
