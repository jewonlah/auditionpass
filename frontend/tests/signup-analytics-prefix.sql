CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz NOT NULL, confirmed_at timestamptz, raw_app_meta_data jsonb);
