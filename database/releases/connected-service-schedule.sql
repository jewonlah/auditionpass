-- Separate owner-approved scheduling step. Requires the project's existing pg_cron.
-- Request-time expiry is enforced even if this maintenance task is unavailable.
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then raise exception 'pg_cron not installed: configure the authenticated maintenance endpoint instead'; end if;
end $$;
select cron.schedule('auditionpass-submission-preparations-cleanup','*/15 * * * *','select public.cleanup_submission_preparations()');
