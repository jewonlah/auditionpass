-- 90 C. Back up applications/jobs before applying. No existing job IDs or payloads rewritten.
begin;
alter table public.applications add column if not exists delivery_status text not null default 'unknown' check(delivery_status in ('unknown','accepted','delivered','bounced'));
alter table public.applications add column if not exists submission_snapshot jsonb;
alter table public.applications add column if not exists active_job_id uuid;
alter table public.applications add column if not exists send_stopped boolean not null default false;
alter table public.application_delivery_jobs add column if not exists state text not null default 'uncertain'
 check(state in ('prepared','dispatching','uncertain','accepted','rejected','cancelled'));
alter table public.application_delivery_jobs drop constraint if exists application_delivery_jobs_application_id_key;
create unique index if not exists application_one_active_job on public.application_delivery_jobs(application_id) where state in ('prepared','dispatching','uncertain');
update public.applications a set active_job_id=j.id from public.application_delivery_jobs j where j.application_id=a.id and a.active_job_id is null;
update public.application_delivery_jobs j set state='accepted' from public.applications a where a.id=j.application_id and a.status in ('sent','replied');
update public.applications set delivery_status='accepted' where status in ('sent','replied') and delivery_status='unknown';
alter table public.applications drop constraint if exists applications_active_job_fk;
alter table public.applications add constraint applications_active_job_fk foreign key(active_job_id) references public.application_delivery_jobs(id) on delete set null;

create table if not exists public.submission_preparations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 audition_id uuid not null references public.auditions(id), profile_version_id uuid not null references public.profile_versions(id),
 fingerprint text not null, pdf_sha256 text not null, material_ids uuid[] not null default '{}', material_hashes jsonb not null default '[]',
 payload jsonb not null, snapshot jsonb not null, mode text not null check(mode in ('production','test')),
 state text not null default 'active' check(state in ('active','invalid','used')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '1 hour'
);
create unique index if not exists preparation_one_active on public.submission_preparations(user_id,audition_id) where state='active';
alter table public.submission_preparations enable row level security;
revoke all on public.submission_preparations from public,anon,authenticated;
grant all on public.submission_preparations to service_role;

create table if not exists public.application_consents (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
 job_id uuid not null references public.application_delivery_jobs(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 preparation_id uuid, wording_version text not null, snapshot jsonb not null, created_at timestamptz not null default now()
);
alter table public.application_consents enable row level security;
revoke all on public.application_consents from public,anon,authenticated;
grant all on public.application_consents to service_role;

create or replace function public.store_submission_preparation(p_user uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare ident uuid; is_deleting boolean;
begin
 insert into public.account_file_lifecycle(user_id) values(p_user) on conflict do nothing;
 select deleting into is_deleting from public.account_file_lifecycle where user_id=p_user for update;
 if is_deleting then raise exception 'ACCOUNT_DELETING'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,34));
 update public.submission_preparations set state='invalid',payload='{}' where user_id=p_user and audition_id=(p_data->>'audition_id')::uuid and state='active';
 insert into public.submission_preparations(user_id,audition_id,profile_version_id,fingerprint,pdf_sha256,material_ids,material_hashes,payload,snapshot,mode)
 values(p_user,(p_data->>'audition_id')::uuid,(p_data->>'profile_version_id')::uuid,p_data->>'fingerprint',p_data->>'pdf_sha256',
 array(select jsonb_array_elements_text(p_data->'material_ids')::uuid),p_data->'material_hashes',p_data->'payload',p_data->'snapshot',p_data->>'mode') returning id into ident;
 return ident;
end; $$;
revoke all on function public.store_submission_preparation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.store_submission_preparation(uuid,jsonb) to service_role;

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
 gate:=public.private_application_audition_gate(prep.audition_id);
 if coalesce((gate->>'ready')::boolean,false)=false or gate->>'fingerprint'<>prep.fingerprint then raise exception 'AUDITION_CHANGED'; end if;
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
 values(app.id,job.id,uid,prep.id,'application-sharing-v1',prep.snapshot);
 update public.submission_preparations set state='used',payload='{}' where id=prep.id;
 return job;
end; $$;
revoke all on function public.claim_submission_preparation(uuid,boolean) from public,anon;
grant execute on function public.claim_submission_preparation(uuid,boolean) to authenticated;

create or replace function public.begin_account_file_deletion(p_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into public.account_file_lifecycle(user_id) values(p_user_id) on conflict do nothing;
 perform 1 from public.account_file_lifecycle where user_id=p_user_id for update;
 if exists(select 1 from public.account_file_operations where user_id=p_user_id) or
 exists(select 1 from public.applications a left join public.application_delivery_jobs j on j.id=a.active_job_id where a.user_id=p_user_id and (a.status='sending' or j.state in ('prepared','dispatching','uncertain'))) then return false; end if;
 update public.account_file_lifecycle set deleting=true where user_id=p_user_id;
 return true;
end; $$;

-- Scheduled cleanup is only housekeeping: request-time expires_at checks remain authoritative.
create or replace function public.cleanup_submission_preparations() returns void language sql security definer set search_path='' as $$
 delete from public.submission_preparations where expires_at<now();
$$;
revoke all on function public.cleanup_submission_preparations() from public,anon,authenticated;
grant execute on function public.cleanup_submission_preparations() to service_role;
commit;
