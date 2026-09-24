-- 98. Apply only while submissions are paused and existing dispatches drained.
-- Deploy the matching app before registering custom subject reviews. No review is auto-approved.
begin;
lock table public.submission_preparations,public.application_delivery_jobs in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.application_delivery_jobs where state in ('prepared','dispatching','uncertain')) or
 exists(select 1 from public.submission_preparations where state='active' and expires_at>now())
 then raise exception 'SUBJECT_CUTOVER_REQUIRES_DRAIN'; end if;
end $$;

create or replace function public.valid_application_subject_rules(format text,roles text[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(case when format='standard' then cardinality(roles)=0
 when format='role_name_age_phone_v1' then cardinality(roles) between 1 and 20
 and cardinality(roles)=(select count(distinct value) from unnest(roles) value)
 and not exists(select 1 from unnest(roles) value where value is null or length(value) not between 1 and 80
 or btrim(value)<>value or value !~ '^[A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣ ._-]+$')
 else false end,false);
$$;
revoke all on function public.valid_application_subject_rules(text,text[]) from public,anon,authenticated;
grant execute on function public.valid_application_subject_rules(text,text[]) to service_role;
alter table public.audition_application_reviews add column subject_format text not null default 'standard',
 add column subject_roles text[] not null default '{}',
 add constraint reviewed_subject_rules check(public.valid_application_subject_rules(subject_format,subject_roles));

create or replace function public.application_review_fingerprint(r public.audition_application_reviews) returns text
language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(r.fingerprint,r.min_age,r.max_age,r.minor_role,to_jsonb(r.required_materials),r.subject_format,to_jsonb(r.subject_roles))::text);
$$;
revoke all on function public.application_review_fingerprint(public.audition_application_reviews) from public,anon,authenticated;
grant execute on function public.application_review_fingerprint(public.audition_application_reviews) to service_role;

-- NULL/malformed metadata is invalid, including old-app preparations using a new gate hash.
create or replace function public.application_subject_snapshot_valid(rules jsonb,snap jsonb,payload jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(snap->'subject') is distinct from 'string' or length(snap->>'subject')=0 or
    (snap->'subject') is distinct from (payload->'subject') then return false; end if;
 if rules->>'format'='standard' then
  return coalesce(snap->>'wordingVersion'='application-sharing-v1' and not (snap ?| array['role','declaredAge','subjectYear']),false);
 elsif rules->>'format'='role_name_age_phone_v1' then
  return coalesce(snap->>'wordingVersion'='application-sharing-subject-v2'
   and jsonb_typeof(snap->'role')='string' and (rules->'roles') ? (snap->>'role')
   and jsonb_typeof(snap->'declaredAge')='number' and (snap->>'declaredAge') ~ '^[0-9]{2,3}$'
   and (snap->>'declaredAge')::numeric between 19 and 120
   and jsonb_typeof(snap->'subjectYear')='number' and (snap->>'subjectYear') ~ '^[0-9]{4}$',false);
 end if;
 return false;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;
revoke all on function public.application_subject_snapshot_valid(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.application_subject_snapshot_valid(jsonb,jsonb,jsonb) to service_role;


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
 and not exists(select 1 from public.audition_application_reviews r where r.audition_id=a.id and (r.minor_role or r.subject_format<>'standard' or cardinality(r.required_materials)>0))
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
 end if;
 update public.application_delivery_jobs set state='dispatching',dispatch_started_at=now() where id=j.id returning * into j;
 return j;
end; $$;

commit;
