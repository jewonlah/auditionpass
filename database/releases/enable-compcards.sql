-- Separate owner-approved step AFTER grant revocation and all save caller tests.
begin;
update public.profile_renderer_registry set enabled=true where renderer_version='compcard-v1';
commit;
