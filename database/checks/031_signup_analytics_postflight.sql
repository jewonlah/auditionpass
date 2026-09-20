-- Read-only verification after applying migration 031.
SELECT jsonb_build_object(
 'rollout_at',(SELECT starts_at FROM public.signup_analytics_rollout WHERE singleton),
 'claim_count',(SELECT count(*) FROM public.signup_analytics_claims),
 'rls_enabled',(SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.signup_analytics_rollout'::regclass,'public.signup_analytics_claims'::regclass)),
 'authenticated_can_claim',has_function_privilege('authenticated','public.claim_signup_analytics()','EXECUTE'),
 'anon_can_claim',has_function_privilege('anon','public.claim_signup_analytics()','EXECUTE'),
 'authenticated_can_read_claims',has_table_privilege('authenticated','public.signup_analytics_claims','SELECT'),
 'authenticated_can_insert_claims',has_table_privilege('authenticated','public.signup_analytics_claims','INSERT'),
 'existing_accounts_before_rollout',(SELECT count(*) FROM auth.users u CROSS JOIN public.signup_analytics_rollout r WHERE u.created_at<r.starts_at)
) AS verification;
