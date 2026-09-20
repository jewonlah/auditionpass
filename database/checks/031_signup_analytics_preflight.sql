-- Read-only deployment check. No credentials, personal data or auth mutation.
SELECT
 to_regclass('public.signup_analytics_rollout') IS NOT NULL AS rollout_exists,
 to_regclass('public.signup_analytics_claims') IS NOT NULL AS claims_exists,
 to_regprocedure('public.claim_signup_analytics()') IS NOT NULL AS function_exists,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name IN ('id','created_at','confirmed_at','raw_app_meta_data')) = 4 AS required_auth_columns_present;
