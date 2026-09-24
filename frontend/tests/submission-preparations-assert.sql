do $$ begin
 if not exists(select 1 from applications where id='99999999-9999-4999-8999-999999999991' and active_job_id='99999999-9999-4999-8999-999999999993') then raise exception 'old job lost during migration'; end if;
 perform acquire_application_dispatch('99999999-9999-4999-8999-999999999993','22222222-2222-4222-8222-222222222222');
 perform record_application_receipt('99999999-9999-4999-8999-999999999993','before-migration-provider');
 if not exists(select 1 from applications where id='99999999-9999-4999-8999-999999999991' and status='sent') then raise exception 'old receipt not restored'; end if;
end $$;
delete from applications where id='99999999-9999-4999-8999-999999999991';
update audition_application_reviews r set fingerprint=application_source_fingerprint(a) from auditions a where a.id=r.audition_id;
select store_submission_preparation('11111111-1111-4111-8111-111111111111',jsonb_build_object(
 'audition_id','33333333-3333-4333-8333-333333333333','profile_version_id',(select id from profile_versions where user_id='11111111-1111-4111-8111-111111111111' and version=2),
 'fingerprint',(select fingerprint from audition_application_reviews where audition_id='33333333-3333-4333-8333-333333333333'),'pdf_sha256','fixture','material_ids','[]'::jsonb,'material_hashes','[]'::jsonb,'payload','{"to":"fixture@example.test"}'::jsonb,'snapshot','{"title":"검증"}'::jsonb,'mode','test')) as prep_id \gset
select set_config('qa.prep', :'prep_id', false);
set role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',false);
do $$ begin
 begin perform claim_submission_preparation(current_setting('qa.prep')::uuid,true); raise exception 'foreign prep accepted'; exception when raise_exception then if sqlerrm<>'PREPARATION_EXPIRED' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',false);
do $$ begin
 begin perform claim_submission_preparation(current_setting('qa.prep')::uuid,false); raise exception 'missing consent accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select begin_account_file_operation('11111111-1111-4111-8111-111111111111') as operation_id \gset
set role authenticated;
do $$ begin
 begin perform claim_submission_preparation(current_setting('qa.prep')::uuid,true); raise exception 'claimed during file removal'; exception when raise_exception then if sqlerrm<>'FILE_OPERATION_PENDING' then raise; end if; end;
end $$;
reset role;
select finish_account_file_operation('11111111-1111-4111-8111-111111111111',:'operation_id');
-- A different owned material must not satisfy a deleted selected material.
insert into materials values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
update submission_preparations set material_ids=array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid] where id=:'prep_id';
set role authenticated;
do $$ begin
 begin perform claim_submission_preparation(current_setting('qa.prep')::uuid,true); raise exception 'missing selected material accepted'; exception when raise_exception then if sqlerrm<>'MATERIAL_CHANGED' then raise; end if; end;
end $$;
reset role;
update submission_preparations set material_ids='{}' where id=:'prep_id';
set role authenticated;
select (claim_submission_preparation(current_setting('qa.prep')::uuid,true)).id as job_id \gset
reset role;
select set_config('qa.job', :'job_id', false);
do $$ begin
 if (select count(*) from application_consents)<>1 then raise exception 'missing consent'; end if;
 if begin_account_file_deletion('11111111-1111-4111-8111-111111111111') then raise exception 'deleted pending account'; end if;
 if (select deleting from account_file_lifecycle where user_id='11111111-1111-4111-8111-111111111111') then raise exception 'failed deletion tombstoned'; end if;
end $$;
select acquire_application_dispatch(:'job_id','11111111-1111-4111-8111-111111111111');
do $$ begin
 begin perform acquire_application_dispatch(current_setting('qa.job')::uuid,'11111111-1111-4111-8111-111111111111'); raise exception 'parallel dispatch accepted'; exception when raise_exception then if sqlerrm<>'JOB_IN_PROGRESS' then raise; end if; end;
end $$;
update application_delivery_jobs set dispatch_started_at=now()-interval '4 minutes' where id=:'job_id';
do $$ declare recovered public.application_delivery_jobs; begin
 recovered:=acquire_application_dispatch(current_setting('qa.job')::uuid,'11111111-1111-4111-8111-111111111111');
 if recovered.id<>current_setting('qa.job')::uuid then raise exception 'recovery changed job key'; end if;
end $$;
select record_application_event('early-event','provider-fixture','delivered',now());
select record_application_receipt(:'job_id','provider-fixture');
select record_application_event('early-event','provider-fixture','delivered',now());
select record_application_event('older-event','provider-fixture','bounced',now()-interval '1 hour');
do $$ begin
 if not exists(select 1 from applications where delivery_status='delivered' and status='sent') then raise exception 'out of order receipt lost'; end if;
 if exists(select 1 from application_delivery_jobs where payload is not null) then raise exception 'accepted payload retained'; end if;
 if (select count(*) from application_delivery_events)<>2 then raise exception 'event not idempotent'; end if;
end $$;
-- Historical jobs lack account lifecycle rows and submission fingerprints.
insert into applications(id,user_id,audition_id,status) values('77777777-7777-4777-8777-777777777777','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','sending');
insert into application_delivery_jobs(id,application_id,payload,mode,state) values('88888888-8888-4888-8888-888888888888','77777777-7777-4777-8777-777777777777','{"to":"internal@example.test"}','production','uncertain');
update applications set active_job_id='88888888-8888-4888-8888-888888888888' where id='77777777-7777-4777-8777-777777777777';
delete from account_file_lifecycle where user_id='22222222-2222-4222-8222-222222222222';
do $$ begin
 if not legacy_application_recovery_allowed('88888888-8888-4888-8888-888888888888','22222222-2222-4222-8222-222222222222') then raise exception 'legacy recovery blocked'; end if;
 perform acquire_application_dispatch('88888888-8888-4888-8888-888888888888','22222222-2222-4222-8222-222222222222');
end $$;
update application_delivery_jobs set dispatch_started_at=now()-interval '4 minutes' where id='88888888-8888-4888-8888-888888888888';
select resolve_application_delivery('88888888-8888-4888-8888-888888888888','cancelled',null,'QA operator','User requested permanent stop','qa:cancel');
do $$ begin
 if not exists(select 1 from applications where id='77777777-7777-4777-8777-777777777777' and send_stopped and status='failed') then raise exception 'permanent stop missing'; end if;
 if not begin_account_file_deletion('22222222-2222-4222-8222-222222222222') then raise exception 'cancelled job prevented deletion'; end if;
end $$;
-- Known receipt restores an old job without any file-operation history or resend.
delete from account_file_lifecycle where user_id='22222222-2222-4222-8222-222222222222';
update application_delivery_jobs set provider_id='legacy-provider',state='uncertain' where id='88888888-8888-4888-8888-888888888888';
select acquire_application_dispatch('88888888-8888-4888-8888-888888888888','22222222-2222-4222-8222-222222222222');
select record_application_receipt('88888888-8888-4888-8888-888888888888','legacy-provider');
delete from applications where id='77777777-7777-4777-8777-777777777777';
insert into application_delivery_events values('orphan-old','never-matched','delivered',now()-interval '9 days',now()-interval '8 days');
select cleanup_submission_preparations();
do $$ begin
 if exists(select 1 from application_delivery_events where event_id='orphan-old') then raise exception 'orphan event retained'; end if;
end $$;
select 'submission reservation, consent, deletion lock, dispatch lock and webhook assertions passed' as result;
