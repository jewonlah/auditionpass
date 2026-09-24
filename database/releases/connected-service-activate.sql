-- OWNER-APPROVED RELEASE STEP ONLY, not an automatic migration.
-- Prerequisites: 032..036 applied, all readers use public_auditions/owned references,
-- all profile writers use save_profile_document, old app instances drained,
-- backup existing table/column grants, verify profile create/update and private reads.
begin;
select public.assert_legacy_delivery_resolved();
revoke select on public.auditions from anon,authenticated;
revoke insert,update on public.profiles from anon,authenticated;
do $$ declare c record; begin
 for c in select column_name from information_schema.columns where table_schema='public' and table_name='auditions' loop
  execute format('revoke select (%I) on public.auditions from anon,authenticated',c.column_name);
 end loop;
 for c in select column_name from information_schema.columns where table_schema='public' and table_name='profiles' loop
  execute format('revoke insert (%I),update (%I) on public.profiles from anon,authenticated',c.column_name,c.column_name);
 end loop;
end $$;
commit;
-- Rollback: disable the five new registry rows, keep compatible readers/RPC.
-- Never restore broad table grants or rewrite old saved documents.
-- Run enable-compcards.sql only AFTER caller verification with these grants revoked.
