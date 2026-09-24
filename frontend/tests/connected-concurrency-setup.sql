insert into auth.users values('55555555-5555-4555-8555-555555555555');
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',false);
select save_profile_document('{"name":"Race fixture","birth_year":2000,"gender":"여성","genre":["배우"]}',true);
insert into auditions(id,title,description,apply_email,deadline,apply_type,is_active,oneclick_blocked,review_status)
values('66666666-6666-4666-8666-666666666666','Concurrent fixture','Adult role','race@example.test',current_date+1,'email',true,false,'approved');
insert into audition_application_reviews(audition_id,fingerprint,minor_role,reviewed_by)
select id,application_source_fingerprint(a),false,'fixture' from auditions a where id='66666666-6666-4666-8666-666666666666';
do $$ declare uid uuid; ident uuid; begin
 foreach uid in array array['44444444-4444-4444-8444-444444444444'::uuid,'55555555-5555-4555-8555-555555555555'::uuid] loop
 ident:=store_submission_preparation(uid,jsonb_build_object('audition_id','66666666-6666-4666-8666-666666666666',
 'profile_version_id',(select id from profile_versions where user_id=uid order by version desc limit 1),
 'fingerprint',private_application_audition_gate('66666666-6666-4666-8666-666666666666')->>'fingerprint',
 'pdf_sha256','fixture','material_ids','[]'::jsonb,'material_hashes','[]'::jsonb,'payload','{"to":"race@example.test","subject":"race"}'::jsonb,'snapshot','{"subject":"race","wordingVersion":"application-sharing-v1"}'::jsonb,'mode','test'));
 update submission_preparations set id=uid where id=ident;
 end loop;
end $$;
