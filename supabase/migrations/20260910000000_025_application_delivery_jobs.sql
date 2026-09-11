-- Persist the exact email request before sending. Only server service_role may access it.
-- Apply with 023 before deploying the new send/recovery routes. No historical data is changed.
create table if not exists public.application_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  payload jsonb,
  mode text not null check (mode in ('production', 'test')),
  provider_id text,
  created_at timestamptz not null default now()
);
alter table public.application_delivery_jobs enable row level security;
revoke all on public.application_delivery_jobs from anon, authenticated;
grant all on public.application_delivery_jobs to service_role;

-- Application outcomes are server-owned: clients can read their own records only.
drop policy if exists "본인 지원 생성" on public.applications;
revoke insert, update, delete on public.applications from anon, authenticated;

-- Payload contains private profile data. Successful sends clear it in the server route.
-- Failed/uncertain payloads are retained for reconciliation; delete with the account/application.
