INSERT INTO auth.users VALUES
 ('11111111-1111-4111-8111-111111111111',now()+interval '1 second',now(),'{"provider":"email"}'),
 ('22222222-2222-4222-8222-222222222222',now()+interval '1 second',now(),'{"provider":"google"}'),
 ('33333333-3333-4333-8333-333333333333',now()-interval '1 year',now(),'{"provider":"email"}'),
 ('44444444-4444-4444-8444-444444444444',now()+interval '1 second',null,'{"provider":"email"}'),
 ('55555555-5555-4555-8555-555555555555',now()+interval '1 second',now(),'{"provider":"unsupported"}');
SET ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.claim_signup_analytics()) THEN RAISE EXCEPTION 'anonymous uid counted'; END IF;
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 IF (SELECT method FROM public.claim_signup_analytics()) IS DISTINCT FROM 'email' THEN RAISE EXCEPTION 'email signup missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_signup_analytics()) THEN RAISE EXCEPTION 'duplicate login counted'; END IF;
 PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
 IF (SELECT method FROM public.claim_signup_analytics()) IS DISTINCT FROM 'google' THEN RAISE EXCEPTION 'google signup missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
 IF EXISTS(SELECT 1 FROM public.claim_signup_analytics()) THEN RAISE EXCEPTION 'historical account counted'; END IF;
 PERFORM set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
 IF EXISTS(SELECT 1 FROM public.claim_signup_analytics()) THEN RAISE EXCEPTION 'unconfirmed account counted'; END IF;
 PERFORM set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
 IF EXISTS(SELECT 1 FROM public.claim_signup_analytics()) THEN RAISE EXCEPTION 'unsupported provider counted'; END IF;
 BEGIN
  PERFORM * FROM public.signup_analytics_claims;
  RAISE EXCEPTION 'private claims exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  DELETE FROM public.signup_analytics_claims;
  RAISE EXCEPTION 'claims deletable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.claim_signup_analytics()','EXECUTE') THEN RAISE EXCEPTION 'anon can claim'; END IF;
 IF (SELECT count(*) FROM public.signup_analytics_claims) <> 2 THEN RAISE EXCEPTION 'incorrect claims'; END IF;
END $$;
UPDATE auth.users SET confirmed_at=now() WHERE id='44444444-4444-4444-8444-444444444444';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $$ BEGIN
 IF (SELECT method FROM public.claim_signup_analytics()) IS DISTINCT FROM 'email' THEN RAISE EXCEPTION 'delayed confirmation missing'; END IF;
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.signup_analytics_claims WHERE user_id='11111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'account deletion did not cascade'; END IF;
END $$;
SELECT 'signup analytics assertions PASS' AS result;
