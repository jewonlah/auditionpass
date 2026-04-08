-- ============================================
-- 크롤링 로그 (수집/분류 성과 추적)
-- ============================================

create table if not exists crawl_logs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default current_date,
  source_name text not null,
  total_collected integer default 0,
  total_saved integer default 0,
  duplicates_skipped integer default 0,
  expired_skipped integer default 0,
  classified_by_keyword integer default 0,
  classified_by_rule integer default 0,
  classified_by_ai integer default 0,
  ai_tokens_used integer default 0,
  errors text,
  duration_seconds real,
  created_at timestamptz default now()
);

create index if not exists idx_crawl_logs_date on crawl_logs(run_date desc);
create index if not exists idx_crawl_logs_source on crawl_logs(source_name);
