-- Run after 028, before deploying the audition materials form.
-- Nullable additions preserve existing profiles; 026 snapshots all new fields on the next save.
begin;
alter table public.profiles
  add column if not exists training text,
  add column if not exists introduction_url text,
  add column if not exists performance_url text,
  add column if not exists audio_url text;

alter table public.profiles
  add constraint profiles_training_length check (training is null or char_length(training) <= 500),
  add constraint profiles_introduction_url_web check (introduction_url is null or introduction_url = '' or introduction_url ~* '^https?://'),
  add constraint profiles_performance_url_web check (performance_url is null or performance_url = '' or performance_url ~* '^https?://'),
  add constraint profiles_audio_url_web check (audio_url is null or audio_url = '' or audio_url ~* '^https?://');
commit;
