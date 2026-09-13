set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update profiles set training = '2025 acting classes', introduction_url = 'https://example.com/intro',
  performance_url = 'https://example.com/acting', audio_url = 'https://example.com/voice'
where id = auth.uid();
do $$ begin
  if (select document_version from profiles where id = auth.uid()) <> 2 then raise exception 'Missing new version'; end if;
  if (select profile->>'training' from profile_versions where version = 2) <> '2025 acting classes' then raise exception 'Training snapshot missing'; end if;
  if (select profile->>'audio_url' from profile_versions where version = 2) <> 'https://example.com/voice' then raise exception 'Audio snapshot missing'; end if;
  if exists(select 1 from profile_versions where version = 1 and profile ? 'training') then raise exception 'Old snapshot changed'; end if;
  if (select count(*) from profiles) <> 1 then raise exception 'RLS leaked another user'; end if;
  begin
    update profiles set training = repeat('a',501) where id=auth.uid();
    raise exception 'Oversize training accepted';
  exception when check_violation then null; end;
  begin
    update profiles set performance_url = 'javascript:bad' where id=auth.uid();
    raise exception 'Unsafe URL accepted';
  exception when check_violation then null; end;
end $$;
update profiles set training=null, introduction_url=null, performance_url=null, audio_url=null where id=auth.uid();
do $$ begin
  if (select document_version from profiles where id=auth.uid()) <> 3 then raise exception 'Clear not versioned'; end if;
  if (select profile->>'training' from profile_versions where version=2) <> '2025 acting classes' then raise exception 'Submitted version changed after clear'; end if;
end $$;
reset role;
select 'PASS: nullable migration, saved materials, immutable versions, RLS, constraints, clearing' as result;
