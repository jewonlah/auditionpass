do $$ begin
 if (select count(*) from profile_versions)<>2 or exists(select 1 from profiles where document_version<>1) then raise exception 'migration changed historical versions'; end if;
 begin update profiles set template_id='cinema',renderer_version='compcard-v1' where id='11111111-1111-4111-8111-111111111111'; raise exception 'direct disabled renderer accepted'; exception when raise_exception then if sqlerrm<>'TEMPLATE_NOT_READY' then raise; end if; end;
end $$;
update profile_renderer_registry set enabled=true where template_id='classic';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',false);
select public.save_profile_document('{"template_id":"classic","template_variant":"model","name":"검증회원"}',false);
do $$ begin
 if not exists(select 1 from profiles where name='검증회원' and renderer_version='compcard-v1' and document_version=2) then raise exception 'new renderer not pinned'; end if;
 if not exists(select 1 from profile_versions where version=1 and renderer_version='legacy-v1') then raise exception 'legacy changed'; end if;
 begin perform public.save_profile_document('{"id":"22222222-2222-4222-8222-222222222222","name":"공격"}',false); raise exception 'accepted owner input'; exception when sqlstate '22023' then null; end;
 begin perform public.save_profile_document('{"renderer_version":"legacy-v1"}',false); raise exception 'accepted renderer input'; exception when sqlstate '22023' then null; end;
 begin perform public.save_profile_document('{"photo_urls":["https://example.com/storage/v1/object/public/profiles/22222222-2222-4222-8222-222222222222/photo.jpg"]}',false); raise exception 'accepted foreign photo'; exception when sqlstate '42501' then null; end;
end $$;
select public.save_profile_document('{"name":"검증회원"}',false);
do $$ begin
 if (select document_version from profiles where id=auth.uid())<>2 then raise exception 'unchanged save created revision'; end if;
end $$;
reset role;
insert into auditions(id,title,description,requirements,apply_email,deadline,apply_type,is_active,oneclick_blocked,source_name,source_url) values('33333333-3333-4333-8333-333333333333','검증공고','성인 배역',null,'internal@example.test',current_date+10,'email',true,false,'QA','https://example.test');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',false);
do $$ begin
 if public.application_audition_gate('33333333-3333-4333-8333-333333333333')->>'code'<>'REQUIREMENTS_UNVERIFIED' then raise exception 'unreviewed allowed'; end if;
end $$;
reset role;
insert into audition_application_reviews(audition_id,fingerprint,minor_role,reviewed_by)
select id,application_source_fingerprint(a),false,'fixture' from auditions a;
set role authenticated;
do $$ begin
 if public.application_audition_gate('33333333-3333-4333-8333-333333333333')->>'ready'<>'true' then raise exception 'reviewed blocked'; end if;
 if public.application_audition_gate('33333333-3333-4333-8333-333333333333') ? 'recipient' then raise exception 'gate leaked email'; end if;
 begin perform private_application_destination('33333333-3333-4333-8333-333333333333','x'); raise exception 'private destination exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update auditions set requirements='추가 영상 필요';
set role authenticated;
do $$ begin
 if public.application_audition_gate('33333333-3333-4333-8333-333333333333')->>'code'<>'REQUIREMENTS_UNVERIFIED' then raise exception 'changed source allowed'; end if;
end $$;
reset role;
select 'connected service assertions passed' as result;
