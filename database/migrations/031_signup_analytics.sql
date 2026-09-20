-- 11 PRD F4 / 2026-09-20 conversion audit: confirmed new accounts, once per account.
-- No auth trigger: measurement failure must never fail signup/login.
-- No historical backfill. Reapplying this file preserves the original rollout time.
BEGIN;
CREATE TABLE IF NOT EXISTS public.signup_analytics_rollout (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  starts_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.signup_analytics_rollout(singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.signup_analytics_claims (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('email','google')),
  claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signup_analytics_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_analytics_claims ENABLE ROW LEVEL SECURITY;
-- Deliberately no direct table policies: only the current-user RPC can claim.
REVOKE ALL ON public.signup_analytics_rollout, public.signup_analytics_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_signup_analytics()
RETURNS TABLE(method text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.signup_analytics_claims AS claims (user_id, method)
  SELECT u.id, u.raw_app_meta_data->>'provider'
  FROM auth.users u CROSS JOIN public.signup_analytics_rollout r
  WHERE u.id = (SELECT auth.uid())
    AND u.created_at >= r.starts_at
    AND u.confirmed_at IS NOT NULL
    AND u.raw_app_meta_data->>'provider' IN ('email','google')
  ON CONFLICT (user_id) DO NOTHING
  RETURNING claims.method;
$$;
REVOKE ALL ON FUNCTION public.claim_signup_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_signup_analytics() TO authenticated;
COMMIT;
