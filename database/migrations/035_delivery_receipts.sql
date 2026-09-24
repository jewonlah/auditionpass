-- Receipt events contain no addresses, message bodies or attachments.
begin;
alter table public.application_delivery_jobs add column if not exists dispatch_started_at timestamptz;
create table if not exists public.application_delivery_events (
 event_id text primary key, provider_id text not null, kind text not null check(kind in ('delivered','bounced')),
 occurred_at timestamptz not null, received_at timestamptz not null default now()
);
alter table public.application_delivery_events enable row level security;
revoke all on public.application_delivery_events from public,anon,authenticated;
grant all on public.application_delivery_events to service_role;

create or replace function public.acquire_application_dispatch(p_job uuid,p_user uuid) returns public.application_delivery_jobs
language plpgsql security definer set search_path='' as $$
declare j public.application_delivery_jobs; deleting boolean;
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
 update public.application_delivery_jobs set state='dispatching',dispatch_started_at=now() where id=j.id returning * into j;
 return j;
end; $$;

create or replace function public.record_application_receipt(p_job uuid,p_provider text) returns void
language plpgsql security definer set search_path='' as $$
declare j public.application_delivery_jobs; result text;
begin
 if nullif(p_provider,'') is null then raise exception 'RECEIPT_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_provider,35));
 select * into j from public.application_delivery_jobs where id=p_job for update;
 if not found or (j.provider_id is not null and j.provider_id<>p_provider) then raise exception 'RECEIPT_MISMATCH'; end if;
 select kind into result from public.application_delivery_events where provider_id=p_provider order by occurred_at desc,(kind='bounced') desc limit 1;
 update public.application_delivery_jobs set provider_id=p_provider,state='accepted',payload=null where id=p_job;
 update public.applications set status=case when status='replied' then status else 'sent' end,email_sent=true,
 sent_at=coalesce(sent_at,now()),delivery_status=coalesce(result,'accepted') where id=j.application_id and active_job_id=p_job;
end; $$;

create or replace function public.record_application_event(p_event text,p_provider text,p_kind text,p_occurred timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare latest text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_provider,35));
 insert into public.application_delivery_events(event_id,provider_id,kind,occurred_at) values(p_event,p_provider,p_kind,p_occurred) on conflict do nothing;
 select kind into latest from public.application_delivery_events where provider_id=p_provider order by occurred_at desc,(kind='bounced') desc limit 1;
 update public.applications a set delivery_status=latest from public.application_delivery_jobs j
 where j.provider_id=p_provider and a.active_job_id=j.id and a.id=j.application_id;
end; $$;
revoke all on function public.acquire_application_dispatch(uuid,uuid),public.record_application_receipt(uuid,text),public.record_application_event(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.acquire_application_dispatch(uuid,uuid),public.record_application_receipt(uuid,text),public.record_application_event(text,text,text,timestamptz) to service_role;
create or replace function public.delete_owned_delivery_events() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.application_delivery_events where provider_id=old.provider_id;
 return old;
end; $$;
revoke all on function public.delete_owned_delivery_events() from public,anon,authenticated;
drop trigger if exists delivery_events_delete on public.application_delivery_jobs;
create trigger delivery_events_delete before delete on public.application_delivery_jobs for each row execute function public.delete_owned_delivery_events();

create table if not exists public.application_delivery_resolutions (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.application_delivery_jobs(id) on delete cascade,
 action text not null check(action in ('accepted','rejected','cancelled')), operator_name text not null,
 reason text not null, evidence_ref text not null, created_at timestamptz not null default now()
);
alter table public.application_delivery_resolutions enable row level security;
revoke all on public.application_delivery_resolutions from public,anon,authenticated;
grant all on public.application_delivery_resolutions to service_role;
create or replace function public.resolve_application_delivery(p_job uuid,p_action text,p_provider text,p_operator text,p_reason text,p_evidence text) returns void
language plpgsql security definer set search_path='' as $$
declare j public.application_delivery_jobs; uid uuid;
begin
 if p_action is null or p_action not in ('accepted','rejected','cancelled') or length(trim(coalesce(p_operator,'')))<2 or length(trim(coalesce(p_reason,'')))<10 or length(trim(coalesce(p_evidence,'')))<5 then raise exception 'EVIDENCE_REQUIRED'; end if;
 select a.user_id into uid from public.applications a join public.application_delivery_jobs d on d.application_id=a.id where d.id=p_job;
 if uid is null then raise exception 'JOB_UNAVAILABLE'; end if;
 insert into public.account_file_lifecycle(user_id) values(uid) on conflict do nothing;
 perform 1 from public.account_file_lifecycle where user_id=uid for update;
 if p_action='accepted' then perform pg_advisory_xact_lock(hashtextextended(p_provider,35)); end if;
 select * into j from public.application_delivery_jobs where id=p_job for update;
 if j.state='dispatching' and coalesce(j.dispatch_started_at,j.created_at)>now()-interval '3 minutes' then raise exception 'DISPATCH_STILL_ACTIVE'; end if;
 if p_action='accepted' then
  perform public.record_application_receipt(p_job,p_provider);
 else
  if j.provider_id is not null or j.state='accepted' then raise exception 'RECEIPT_ALREADY_EXISTS'; end if;
  update public.application_delivery_jobs set state=p_action,payload=null where id=p_job;
  update public.applications set status='failed',send_stopped=(p_action='cancelled'),email_sent=false where id=j.application_id and active_job_id=p_job;
 end if;
 insert into public.application_delivery_resolutions(job_id,action,operator_name,reason,evidence_ref) values(p_job,p_action,p_operator,p_reason,p_evidence);
end; $$;
revoke all on function public.resolve_application_delivery(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_application_delivery(uuid,text,text,text,text,text) to service_role;

-- Old jobs have no source fingerprint. Recovery may replay only their exact original
-- payload, within the same 23h key window, while the current source still agrees.
create or replace function public.legacy_application_recovery_allowed(p_job uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.application_delivery_jobs j join public.applications x on x.id=j.application_id join public.auditions a on a.id=x.audition_id
 where j.id=p_job and x.user_id=p_user and x.active_job_id=j.id and x.submission_snapshot is null
 and j.created_at>now()-interval '23 hours' and j.payload is not null and a.is_active and a.review_status in ('auto','approved') and not a.oneclick_blocked
 and (a.deadline is null or a.deadline>=(now() at time zone 'Asia/Seoul')::date) and a.apply_type='email'
 and (j.mode='test' or lower(j.payload->>'to')=lower(a.apply_email))
 and not exists(select 1 from public.audition_application_reviews r where r.audition_id=a.id and r.minor_role)
 and not exists(select 1 from public.suppression s where
 (s.kind='email' and lower(a.apply_email)=lower(s.value)) or (s.kind='source' and coalesce(a.source_name,'') ilike s.value||'%') or
 (s.kind='domain' and (lower(a.apply_email) like '%@'||lower(s.value) or lower(coalesce(a.source_url,'')) like '%'||lower(s.value)||'%'))));
$$;
revoke all on function public.legacy_application_recovery_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.legacy_application_recovery_allowed(uuid,uuid) to service_role;

-- Legacy sending rows can predate delivery jobs. Resolve only with external evidence;
-- elapsed time alone never proves non-delivery. No payload or new send key is created.
create table if not exists public.application_legacy_resolutions (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.applications(id) on delete cascade,
 action text not null check(action in ('rejected','cancelled')),
 operator_name text not null, reason text not null, evidence_ref text not null,
 created_at timestamptz not null default now()
);
alter table public.application_legacy_resolutions enable row level security;
revoke all on public.application_legacy_resolutions from public,anon,authenticated;
grant all on public.application_legacy_resolutions to service_role;
create or replace function public.resolve_application_without_job(p_application uuid,p_action text,p_operator text,p_reason text,p_evidence text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid; a public.applications;
begin
 if p_action is null or p_action not in ('rejected','cancelled') or length(trim(coalesce(p_operator,'')))<2 or length(trim(coalesce(p_reason,'')))<10 or length(trim(coalesce(p_evidence,'')))<5 then raise exception 'EVIDENCE_REQUIRED'; end if;
 select user_id into uid from public.applications where id=p_application;
 if uid is null then raise exception 'APPLICATION_UNAVAILABLE'; end if;
 insert into public.account_file_lifecycle(user_id) values(uid) on conflict do nothing;
 perform 1 from public.account_file_lifecycle where user_id=uid for update;
 select * into a from public.applications where id=p_application for update;
 if not found or a.status<>'sending' or a.email_sent or a.active_job_id is not null
   or exists(select 1 from public.application_delivery_jobs where application_id=p_application)
 then raise exception 'LEGACY_RESOLUTION_NOT_ALLOWED'; end if;
 update public.applications set status='failed',send_stopped=(p_action='cancelled'),email_sent=false where id=a.id;
 insert into public.application_legacy_resolutions(application_id,action,operator_name,reason,evidence_ref)
 values(a.id,p_action,p_operator,p_reason,p_evidence);
end; $$;
revoke all on function public.resolve_application_without_job(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_application_without_job(uuid,text,text,text,text) to service_role;

-- Release gate: historical ambiguity must be inventoried and resolved before cutover.
create or replace function public.assert_legacy_delivery_resolved() returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.applications a where a.submission_snapshot is null and
  (a.status='sending' or exists(select 1 from public.application_delivery_jobs j where j.application_id=a.id and j.state in ('prepared','dispatching','uncertain'))))
 then raise exception 'LEGACY_DELIVERY_REQUIRES_REVIEW'; end if;
end; $$;
revoke all on function public.assert_legacy_delivery_resolved() from public,anon,authenticated;
grant execute on function public.assert_legacy_delivery_resolved() to service_role;

create or replace function public.cleanup_submission_preparations() returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.submission_preparations where expires_at<now();
 delete from public.application_delivery_events e where received_at<now()-interval '7 days' and not exists(select 1 from public.application_delivery_jobs j where j.provider_id=e.provider_id);
end; $$;
commit;
