-- Isolated fictional data only; apply after 038.
insert into auth.users values('88888888-8888-4888-8888-888888888888');
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}',false);
select save_profile_document('{"name":"Requirement Fixture","birth_year":1985,"gender":"남성","genre":["배우"],"career":"Fictional career","phone":"01012345678"}',true);
insert into auditions(id,title,description,apply_email,deadline,apply_type,is_active,oneclick_blocked,review_status)
values('88888888-8888-4888-8888-888888888888','Requirements fixture','Fictional','nobody@example.test',current_date+2,'email',true,false,'approved');
insert into audition_application_reviews(audition_id,fingerprint,minor_role,reviewed_by,required_gender,require_career,acknowledgements,age_scope,min_age,max_age)
select id,application_source_fingerprint(a),false,'fixture','남성',true,array['Arrival','All dates'],'pilot',30,50 from auditions a where id='88888888-8888-4888-8888-888888888888';
create function qa_requirements_preparation() returns uuid language plpgsql as $$
declare ident uuid:='88888888-8888-4888-8888-888888888888'; g jsonb; snap jsonb; begin
 g:=private_application_audition_gate(ident);
 snap:=jsonb_build_object('subject','[TEST] requirements','wordingVersion','application-sharing-v1','requirementsVersion',1,'acceptedAcknowledgements',g#>'{requirements,acknowledgements}','fingerprint',g->>'fingerprint');
 return store_submission_preparation(ident,jsonb_build_object('audition_id',ident,'profile_version_id',(select id from profile_versions where user_id=ident and version=1),'fingerprint',g->>'fingerprint','pdf_sha256','fixture','material_ids','[]'::jsonb,'material_hashes','[]'::jsonb,'snapshot',snap,'payload',jsonb_build_object('to','nobody@example.test','subject','[TEST] requirements'),'mode','test'));
end $$;
revoke all on function qa_requirements_preparation() from public;
do $$ declare g jsonb; snap jsonb; p jsonb; bad jsonb; ident uuid; original jsonb; job uuid; fp text; begin
 if has_function_privilege('authenticated','application_requirements_snapshot_valid(jsonb,jsonb,jsonb)','execute') or has_function_privilege('anon','application_requirements_snapshot_valid(jsonb,jsonb,jsonb)','execute') then raise exception 'helper public'; end if;
 g:=private_application_audition_gate('88888888-8888-4888-8888-888888888888');
 snap:=jsonb_build_object('requirementsVersion',1,'acceptedAcknowledgements',g#>'{requirements,acknowledgements}');
 select profile into p from profile_versions where user_id='88888888-8888-4888-8888-888888888888' and version=1;
 if not application_requirements_snapshot_valid(g->'requirements',snap,p) then raise exception 'valid requirements rejected'; end if;
 foreach bad in array array[p-'gender',p||'{"gender":"여성"}',p||'{"gender":"기타"}',p-'career',p||'{"career":" \n\t "}',p||'{"career":123}',p-'birth_year'] loop
  if application_requirements_snapshot_valid(g->'requirements',snap,bad) then raise exception 'invalid profile accepted'; end if;
 end loop;
 foreach bad in array array[snap-'requirementsVersion',snap||'{"requirementsVersion":"1"}',snap-'acceptedAcknowledgements',snap||'{"acceptedAcknowledgements":[]}',snap||'{"acceptedAcknowledgements":["All dates","Arrival"]}'] loop
  if application_requirements_snapshot_valid(g->'requirements',bad,p) then raise exception 'invalid acknowledgement accepted'; end if;
 end loop;
 if valid_application_acknowledgements(array['A','A']) or valid_application_acknowledgements(array[' ']) or valid_application_acknowledgements(array[null]) then raise exception 'invalid registry acknowledgement accepted'; end if;
 fp:=g->>'fingerprint';
 update audition_application_reviews set require_career=false where audition_id='88888888-8888-4888-8888-888888888888';
 if fp=private_application_audition_gate('88888888-8888-4888-8888-888888888888')->>'fingerprint' then raise exception 'new field omitted from fingerprint'; end if;
 update audition_application_reviews set require_career=true where audition_id='88888888-8888-4888-8888-888888888888';
 ident:=qa_requirements_preparation(); select snapshot into original from submission_preparations where id=ident;
 -- 037 app has a current gate fingerprint but lacks the new confirmation metadata.
 update submission_preparations set snapshot=original-array['requirementsVersion','acceptedAcknowledgements'] where id=ident;
 begin perform claim_submission_preparation(ident,true); raise exception 'old app claimed'; exception when raise_exception then if sqlerrm<>'PREPARATION_CHANGED' then raise; end if; end;
 update submission_preparations set snapshot=original where id=ident;
 -- A trusted-server preparation still cannot send an incompatible immutable profile.
 update profile_versions set profile=p||'{"career":""}' where user_id='88888888-8888-4888-8888-888888888888' and version=1;
 begin perform claim_submission_preparation(ident,true); raise exception 'missing career claimed'; exception when raise_exception then if sqlerrm<>'PREPARATION_CHANGED' then raise; end if; end;
 update profile_versions set profile=p where user_id='88888888-8888-4888-8888-888888888888' and version=1;
 select id into job from claim_submission_preparation(ident,true);
 update application_consents set snapshot=original-array['requirementsVersion','acceptedAcknowledgements'] where job_id=job;
 begin perform acquire_application_dispatch(job,'88888888-8888-4888-8888-888888888888'); raise exception 'old claimed job dispatched'; exception when raise_exception then if sqlerrm<>'MANUAL_REVIEW:PREPARATION_CHANGED' then raise; end if; end;
 update application_consents set snapshot=original where job_id=job;
 perform acquire_application_dispatch(job,'88888888-8888-4888-8888-888888888888');
 update application_delivery_jobs set state='accepted',provider_id='requirements-fixture' where id=job;
 update applications set submission_snapshot=null where active_job_id=job;
 if legacy_application_recovery_allowed(job,'88888888-8888-4888-8888-888888888888') then raise exception 'legacy bypassed new criteria'; end if;
 -- With no new source conditions, a current standard snapshot still works.
 g:=jsonb_set(g,'{requirements}',g->'requirements'||'{"requiredGender":null,"requireCareer":false,"acknowledgements":[],"ageScope":"source"}');
 if not application_requirements_snapshot_valid(g->'requirements','{"requirementsVersion":1,"acceptedAcknowledgements":[]}',p) then raise exception 'standard current contract regressed'; end if;
end $$;
select '038 requirement checks passed' as result;
