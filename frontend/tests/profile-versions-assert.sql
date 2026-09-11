do $$ begin
  if (select count(*) from profile_versions) <> 2 then raise exception 'Backfill missing'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update profiles set name = 'Edited', template_id = 'career', document_version = 900 where id = auth.uid();
update profiles set name = 'Edited', updated_at = now(), document_version = 700 where id = auth.uid();
do $$ begin
  if (select document_version from profiles where id = auth.uid()) <> 2 then raise exception 'Version sequence/no-op broken'; end if;
  if (select count(*) from profile_versions) <> 2 then raise exception 'RLS leak or snapshot missing'; end if;
  if (select profile->>'name' from profile_versions where version = 1) <> 'Original' then raise exception 'Old revision changed'; end if;
  if (select profile->>'template_id' from profile_versions where version = 2) <> 'career' then raise exception 'Template not saved'; end if;
  begin
    update profile_versions set profile = '{}' where user_id = auth.uid();
    raise exception 'Client modified immutable version';
  exception when insufficient_privilege then null; end;
  begin
    insert into profile_versions(user_id,version,profile) values(auth.uid(),99,'{}');
    raise exception 'Client inserted forged version';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Snapshot failure must roll back the profile update as well.
create function reject_snapshot() returns trigger language plpgsql as $$ begin raise exception 'test snapshot failure'; end $$;
create trigger reject_snapshot before insert on profile_versions for each row execute function reject_snapshot();
do $$ begin
  begin
    update profiles set name = 'Must roll back' where id = '11111111-1111-4111-8111-111111111111';
  exception when raise_exception then null; end;
  if (select name from profiles where id = '11111111-1111-4111-8111-111111111111') <> 'Edited' then raise exception 'Atomic save broken'; end if;
end $$;
drop trigger reject_snapshot on profile_versions;
insert into applications(id,user_id,profile_version_id)
select '33333333-3333-4333-8333-333333333333', user_id, id from profile_versions
where user_id = '11111111-1111-4111-8111-111111111111' and version = 1;
delete from profiles where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if exists(select 1 from profile_versions where user_id = '11111111-1111-4111-8111-111111111111') then raise exception 'Account versions remain'; end if;
  if exists(select 1 from applications) then raise exception 'Account applications remain'; end if;
end $$;
select 'PASS: backfill, revisions, no-op, RLS, immutable history, atomic rollback, account cascade' as result;
insert into storage.objects values
('55555555-5555-4555-8555-555555555555', 'profiles'),
('66666666-6666-4666-8666-666666666666', 'profile-documents');
set role authenticated;
do $$ begin
  if (select count(*) from storage.objects) <> 1 then raise exception 'Private PDF leaked through broad storage policy'; end if;
  begin
    insert into storage.objects values ('77777777-7777-4777-8777-777777777777','profile-documents');
    raise exception 'Client uploaded PDF';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
do $$ begin
  if (select count(*) from storage.objects) <> 2 then raise exception 'Service cannot manage private files'; end if;
end $$;
reset role;
select 'PASS: private PDF policy overrides broad client policy; service role allowed' as result;
