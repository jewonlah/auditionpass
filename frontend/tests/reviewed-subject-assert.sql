-- Synthetic fixtures only, isolated network-none PostgreSQL.
insert into auth.users values('99999999-9999-4999-8999-999999999999');
select set_config('request.jwt.claims','{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}',false);
select save_profile_document('{"name":"Subject Actor","birth_year":2000,"gender":"여성","genre":["배우"],"phone":"01012345678"}',true);
insert into auditions(id,title,description,apply_email,deadline,apply_type,is_active,oneclick_blocked,review_status)
values('99999999-9999-4999-8999-999999999999','Subject fixture','Adult role','subject@example.test',current_date+2,'email',true,false,'approved');
insert into audition_application_reviews(audition_id,fingerprint,minor_role,reviewed_by,subject_format,subject_roles)
select id,application_source_fingerprint(a),false,'fixture','role_name_age_phone_v1',array['지안','민수'] from auditions a where id='99999999-9999-4999-8999-999999999999';

do $$ declare roles text[]; fp text; gate jsonb; begin
 if has_function_privilege('authenticated','application_review_fingerprint(audition_application_reviews)','execute') or
 has_function_privilege('anon','application_subject_snapshot_valid(jsonb,jsonb,jsonb)','execute') or
 has_function_privilege('authenticated','private_application_destination(uuid,text)','execute') then raise exception 'private helper exposed'; end if;
 foreach roles slice 1 in array array[array['A','A'],array[' A','B'],array['A/B','B'],array[null,'B'],array[E'A\n','B'],array['A'||chr(8238),'B'],array[repeat('A',81),'B']] loop
  begin update audition_application_reviews set subject_roles=roles where audition_id='99999999-9999-4999-8999-999999999999'; raise exception 'invalid roles accepted'; exception when check_violation then null; end;
 end loop;
 if valid_application_subject_rules('standard',array['A']) or valid_application_subject_rules('unknown','{}') or valid_application_subject_rules('role_name_age_phone_v1','{}') or
 valid_application_subject_rules('role_name_age_phone_v1',array(select n::text from generate_series(1,21) n)) then raise exception 'invalid format accepted'; end if;
 gate:=private_application_audition_gate('99999999-9999-4999-8999-999999999999'); fp:=gate->>'fingerprint';
 if private_application_destination('99999999-9999-4999-8999-999999999999',fp) is distinct from 'subject@example.test' then raise exception 'destination does not match gate'; end if;
 if application_audition_gate('99999999-9999-4999-8999-999999999999') ? 'fingerprint' then raise exception 'fingerprint leaked'; end if;
 update audition_application_reviews set min_age=20 where audition_id='99999999-9999-4999-8999-999999999999';
 if private_application_destination('99999999-9999-4999-8999-999999999999',fp) is not null then raise exception 'old requirement fingerprint accepted'; end if;
 update audition_application_reviews set min_age=null,required_materials=array['A,B','C'] where audition_id='99999999-9999-4999-8999-999999999999';
 fp:=private_application_audition_gate('99999999-9999-4999-8999-999999999999')->>'fingerprint';
 update audition_application_reviews set required_materials=array['A','B,C'] where audition_id='99999999-9999-4999-8999-999999999999';
 if fp=private_application_audition_gate('99999999-9999-4999-8999-999999999999')->>'fingerprint' then raise exception 'array delimiter hash collision'; end if;
 update audition_application_reviews set required_materials='{}' where audition_id='99999999-9999-4999-8999-999999999999';
end $$;

-- Test-only helper, also used by the two-session review/claim race harness.
create function public.qa_subject_preparation() returns uuid language plpgsql as $$
declare yr integer:=extract(year from now() at time zone 'Asia/Seoul'); snap jsonb; subj text; begin
 subj:='[TEST] [지안] Subject Actor / '||(yr-2000)::text||' / 01012345678';
 snap:=jsonb_build_object('subject',subj,'role','지안','declaredAge',yr-2000,'subjectYear',yr,'wordingVersion','application-sharing-subject-v2',
 'fingerprint',private_application_audition_gate('99999999-9999-4999-8999-999999999999')->>'fingerprint');
 return store_submission_preparation('99999999-9999-4999-8999-999999999999',jsonb_build_object(
 'audition_id','99999999-9999-4999-8999-999999999999','profile_version_id',(select id from profile_versions where user_id='99999999-9999-4999-8999-999999999999' and version=1),
 'fingerprint',snap->>'fingerprint','pdf_sha256','fixture','material_ids','[]'::jsonb,'material_hashes','[]'::jsonb,
 'payload',jsonb_build_object('to','subject@example.test','subject',subj),'snapshot',snap,'mode','test'));
end $$;
revoke all on function qa_subject_preparation() from public;
select qa_subject_preparation() as prep_id \gset
select set_config('qa.subject_prep', :'prep_id',false);
do $$ declare ident uuid:=current_setting('qa.subject_prep')::uuid; snap jsonb; mutation jsonb; begin
 select snapshot into snap from submission_preparations where id=ident;
 foreach mutation in array array[snap-'role',snap||'{"role":"not allowed"}',snap||'{"declaredAge":25.5}',snap||'{"declaredAge":18}',snap||'{"declaredAge":"26"}',snap-'wordingVersion',snap||'{"wordingVersion":"application-sharing-v1"}',snap||'{"subject":"different title"}'] loop
  update submission_preparations set snapshot=mutation where id=ident;
  begin perform claim_submission_preparation(ident,true); raise exception 'bad snapshot claimed'; exception when raise_exception then if sqlerrm<>'PREPARATION_CHANGED' then raise; end if; end;
 end loop;
 update submission_preparations set snapshot=snap||'{"subjectYear":2025}' where id=ident;
 begin perform claim_submission_preparation(ident,true); raise exception 'stale year claimed'; exception when raise_exception then if sqlerrm<>'PREPARATION_EXPIRED' then raise; end if; end;
 update submission_preparations set snapshot=snap where id=ident;
 update audition_application_reviews set subject_roles=array['민수'] where audition_id='99999999-9999-4999-8999-999999999999';
 begin perform claim_submission_preparation(ident,true); raise exception 'changed review claimed'; exception when raise_exception then if sqlerrm<>'AUDITION_CHANGED' then raise; end if; end;
 update audition_application_reviews set subject_roles=array['지안','민수'] where audition_id='99999999-9999-4999-8999-999999999999';
 -- An old prepare implementation with the NEW hash but no metadata is rejected.
 update submission_preparations set snapshot='{}' where id=ident;
 begin perform claim_submission_preparation(ident,true); raise exception 'old prepare claimed'; exception when raise_exception then if sqlerrm not in ('PREPARATION_CHANGED','PREPARATION_EXPIRED') then raise; end if; end;
 update submission_preparations set snapshot=snap where id=ident;
 if application_subject_snapshot_valid('{"format":"standard","roles":[]}',snap,jsonb_build_object('subject',snap->>'subject')) then raise exception 'custom metadata accepted for standard'; end if;
end $$;
set role authenticated;
select (claim_submission_preparation(current_setting('qa.subject_prep')::uuid,true)).id as job_id \gset
reset role;
select set_config('qa.subject_job', :'job_id',false);
do $$ declare job uuid:=current_setting('qa.subject_job')::uuid; snap jsonb; begin
 select snapshot into snap from application_consents where job_id=job;
 if not exists(select 1 from application_consents c join application_delivery_jobs j on j.id=c.job_id join applications a on a.id=j.application_id
 where j.id=job and c.wording_version='application-sharing-subject-v2' and c.snapshot->'subject'=j.payload->'subject'
 and a.submission_snapshot=c.snapshot-'fingerprint') then raise exception 'snapshot/consent/payload mismatch'; end if;
 update application_consents set snapshot=snap||'{"subjectYear":2025}' where job_id=job;
 begin perform acquire_application_dispatch(job,'99999999-9999-4999-8999-999999999999'); raise exception 'old year dispatched'; exception when raise_exception then if sqlerrm<>'MANUAL_REVIEW:SUBJECT_YEAR_CHANGED' then raise; end if; end;
 update application_consents set snapshot=snap where job_id=job;
 update audition_application_reviews set subject_roles=array['민수'] where audition_id='99999999-9999-4999-8999-999999999999';
 begin perform acquire_application_dispatch(job,'99999999-9999-4999-8999-999999999999'); raise exception 'changed role dispatched'; exception when raise_exception then if sqlerrm<>'MANUAL_REVIEW:AUDITION_CHANGED' then raise; end if; end;
 if begin_account_file_deletion('99999999-9999-4999-8999-999999999999') then raise exception 'ambiguous job allowed deletion'; end if;
 begin perform resolve_application_delivery(job,'rejected',null,'qa','no evidence',''); raise exception 'resolved without evidence'; exception when raise_exception then if sqlerrm<>'EVIDENCE_REQUIRED' then raise; end if; end;
 perform resolve_application_delivery(job,'rejected',null,'QA operator','Provider verified no acceptance','qa:verified-no-send');
 if not begin_account_file_deletion('99999999-9999-4999-8999-999999999999') then raise exception 'resolved job still blocked deletion'; end if;
end $$;
update account_file_lifecycle set deleting=false where user_id='99999999-9999-4999-8999-999999999999';
delete from applications where user_id='99999999-9999-4999-8999-999999999999';
update audition_application_reviews set subject_roles=array['지안','민수'] where audition_id='99999999-9999-4999-8999-999999999999';
select qa_subject_preparation() as valid_prep \gset
select (claim_submission_preparation(:'valid_prep',true)).id as valid_job \gset
do $$ declare job uuid; begin
 select active_job_id into job from applications where user_id='99999999-9999-4999-8999-999999999999';
 update applications set submission_snapshot=null where active_job_id=job;
 if legacy_application_recovery_allowed(job,'99999999-9999-4999-8999-999999999999') then raise exception 'legacy custom subject allowed'; end if;
 update audition_application_reviews set subject_format='standard',subject_roles='{}',required_materials=array['acting_video'] where audition_id='99999999-9999-4999-8999-999999999999';
 if legacy_application_recovery_allowed(job,'99999999-9999-4999-8999-999999999999') then raise exception 'legacy required materials allowed'; end if;
 update audition_application_reviews set required_materials='{}' where audition_id='99999999-9999-4999-8999-999999999999';
 if not legacy_application_recovery_allowed(job,'99999999-9999-4999-8999-999999999999') then raise exception 'legacy standard unexpectedly blocked'; end if;
 update audition_application_reviews set subject_format='role_name_age_phone_v1',subject_roles=array['지안','민수'] where audition_id='99999999-9999-4999-8999-999999999999';
 update applications set submission_snapshot=(select snapshot-'fingerprint' from application_consents where job_id=job) where active_job_id=job;
end $$;
select acquire_application_dispatch(:'valid_job','99999999-9999-4999-8999-999999999999');
select record_application_receipt(:'valid_job','subject-provider');
-- Receipt restoration is allowed even after the review changes; never resends.
update audition_application_reviews set subject_roles=array['민수'] where audition_id='99999999-9999-4999-8999-999999999999';
select acquire_application_dispatch(:'valid_job','99999999-9999-4999-8999-999999999999');
delete from applications where user_id='99999999-9999-4999-8999-999999999999';
update audition_application_reviews set subject_roles=array['지안','민수'] where audition_id='99999999-9999-4999-8999-999999999999';
select 'Reviewed subject constraints, hashes, claims, year, dispatch, evidence resolution passed' as result;
