-- G1: closing new adoption must not prevent existing members from editing.
begin;
update profile_renderer_registry set enabled=false where renderer_version='compcard-v1';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select save_profile_document('{"name":"서식 중단 중 수정"}',false);
do $$ begin
 if not exists(select 1 from profiles where id=auth.uid() and name='서식 중단 중 수정' and template_id='classic' and renderer_version='compcard-v1') then raise exception 'existing design save blocked'; end if;
 begin perform save_profile_document('{"template_id":"cinema"}',false); raise exception 'disabled adoption allowed'; exception when sqlstate '22023' then null; end;
 perform save_profile_document('{"template_id":"casting"}',false);
 begin perform save_profile_document('{"template_id":"classic"}',false); raise exception 'disabled readoption allowed'; exception when sqlstate '22023' then null; end;
end $$;
rollback;

-- G5/G6: actual JSON claims, no subject required for service_role, no private gate for members.
begin;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select private_application_audition_gate('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
 if application_audition_gate('33333333-3333-4333-8333-333333333333') ? 'fingerprint' then raise exception 'public gate leaked fingerprint'; end if;
 begin perform private_application_audition_gate('33333333-3333-4333-8333-333333333333'); raise exception 'member called private gate'; exception when insufficient_privilege then null; end;
 begin perform resolve_application_without_job('99999999-9999-4999-8999-999999999981','cancelled','QA','User requested permanent stop','qa:stop'); raise exception 'member resolved legacy send'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin perform application_audition_gate('33333333-3333-4333-8333-333333333333'); raise exception 'missing identity allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- G2/G3: never infer non-delivery from old failed status; evidence unlocks recovery.
begin;
do $$ begin
 if not exists(select 1 from application_delivery_jobs where id='99999999-9999-4999-8999-999999999983' and state='uncertain') then raise exception 'legacy failure silently reclassified'; end if;
 begin perform assert_legacy_delivery_resolved(); raise exception 'ambiguous cutover allowed'; exception when raise_exception then if sqlerrm<>'LEGACY_DELIVERY_REQUIRES_REVIEW' then raise; end if; end;
 if begin_account_file_deletion('22222222-2222-4222-8222-222222222222') then raise exception 'ambiguous deletion allowed'; end if;
 begin perform resolve_application_without_job('99999999-9999-4999-8999-999999999981','cancelled','QA','short',''); raise exception 'missing evidence allowed'; exception when raise_exception then if sqlerrm<>'EVIDENCE_REQUIRED' then raise; end if; end;
end $$;
select resolve_application_without_job('99999999-9999-4999-8999-999999999981','cancelled','QA operator','User requested permanent stop; requests drained','qa:legacy-stop');
do $$ begin
 if not exists(select 1 from applications where id='99999999-9999-4999-8999-999999999981' and send_stopped and status='failed') then raise exception 'jobless stop lost'; end if;
 if (select count(*) from application_legacy_resolutions where application_id='99999999-9999-4999-8999-999999999981')<>1 then raise exception 'jobless audit missing'; end if;
end $$;
select resolve_application_delivery('99999999-9999-4999-8999-999999999983','rejected',null,'QA operator','Provider confirmed no acceptance; requests drained','qa:confirmed-rejection');
-- Existing receipt fixture must also be reconciled before deletion is available.
select record_application_receipt('99999999-9999-4999-8999-999999999993','before-migration-provider');
select assert_legacy_delivery_resolved();
do $$ begin
 if not begin_account_file_deletion('22222222-2222-4222-8222-222222222222') then raise exception 'resolved account still blocked'; end if;
end $$;
update account_file_lifecycle set deleting=false where user_id='22222222-2222-4222-8222-222222222222';
update auditions set is_active=true where id='99999999-9999-4999-8999-999999999982';
insert into audition_application_reviews(audition_id,fingerprint,minor_role,reviewed_by)
select id,application_source_fingerprint(a),false,'fixture' from auditions a where id='99999999-9999-4999-8999-999999999982'
on conflict(audition_id) do update set fingerprint=excluded.fingerprint;
select store_submission_preparation('22222222-2222-4222-8222-222222222222',jsonb_build_object(
 'audition_id','99999999-9999-4999-8999-999999999982','profile_version_id',(select id from profile_versions where user_id='22222222-2222-4222-8222-222222222222' and version=1),
 'fingerprint',(select fingerprint from audition_application_reviews where audition_id='99999999-9999-4999-8999-999999999982'),
 'pdf_sha256','fixture','material_ids','[]'::jsonb,'material_hashes','[]'::jsonb,'payload','{}'::jsonb,'snapshot','{"title":"retry","fingerprint":"private-fixture"}'::jsonb,'mode','test')) as legacy_prep \gset
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select (claim_submission_preparation(:'legacy_prep',true)).id;
reset role;
do $$ begin
 if not exists(select 1 from applications where id='99999999-9999-4999-8999-999999999984' and status='sending' and not (submission_snapshot ? 'fingerprint')) then raise exception 'legacy retry or fingerprint isolation failed'; end if;
 if not exists(select 1 from application_consents where snapshot->>'fingerprint'='private-fixture') then raise exception 'private consent fingerprint lost'; end if;
end $$;
rollback;
delete from applications where id in ('99999999-9999-4999-8999-999999999981','99999999-9999-4999-8999-999999999984');
select 'release regressions passed' as result;
