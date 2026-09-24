update auditions set is_active=false;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',false);
do $$ begin
 if exists(select 1 from public_auditions) then raise exception 'private audition in public view'; end if;
 if (select count(*) from owned_audition_references(array['33333333-3333-4333-8333-333333333333'::uuid]))<>1 then raise exception 'lost own inactive history'; end if;
 begin perform apply_email from auditions; raise exception 'private email readable'; exception when insufficient_privilege then null; end;
 begin update profiles set name='direct'; raise exception 'direct profile write allowed'; exception when insufficient_privilege then null; end;
 perform save_profile_document('{"name":"검증회원"}',false);
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',false);
do $$ begin
 if exists(select 1 from owned_audition_references(array['33333333-3333-4333-8333-333333333333'::uuid])) then raise exception 'foreign history visible'; end if;
end $$;
reset role;
-- Bookmarks do not require onboarding/profile creation.
insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
update auditions set is_active=true where id='33333333-3333-4333-8333-333333333333';
insert into bookmarks(user_id,audition_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',false);
do $$ begin
 if (select count(*) from owned_audition_references(array['33333333-3333-4333-8333-333333333333'::uuid]))<>1 then raise exception 'profileless bookmark disappeared'; end if;
end $$;
reset role;
update auditions set is_active=false;
insert into auth.users values('44444444-4444-4444-8444-444444444444');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',false);
do $$ begin
 perform save_profile_document('{"name":"신규회원","birth_year":2000,"gender":"여성","genre":["배우"]}',true);
 if not exists(select 1 from profiles where id=auth.uid() and template_id='casting' and renderer_version='legacy-v1' and document_version=1) then raise exception 'new profile defaults lost'; end if;
end $$;
reset role;
select 'public view, own history and profile grant transition passed' as result;
