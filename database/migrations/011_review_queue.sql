-- ============================================
-- 011. 검수 큐 + 출처 신뢰 + 발견 큐 (2026-08-22, 플랜 E-1)
--  - auditions.review_status: auto(자동 게재) | pending(검수 대기, 비활성) | approved | rejected
--  - trusted_sources: 자동 게재가 허용된 출처(source_name). 없는 출처의 신규 공고는 pending.
--  - source_candidates: 웹문서·SNS 검색에서 발견된 도메인/계정 후보 — 운영자 승인 시 화이트리스트로 승격.
--  멱등. 추가 전용(백업 불필요).
-- ============================================

alter table auditions add column if not exists review_status text default 'auto';
alter table auditions drop constraint if exists auditions_review_status_check;
alter table auditions add constraint auditions_review_status_check
  check (review_status in ('auto', 'pending', 'approved', 'rejected'));
create index if not exists idx_auditions_review_pending on auditions(created_at desc) where review_status = 'pending';

create table if not exists trusted_sources (
  source_name text primary key,
  note text,
  trusted_at timestamptz default now()
);

-- 현재 라이브에 활성으로 올라가 있는 출처는 이미 운영자가 게재를 승인한 상태 → 신뢰 시드
insert into trusted_sources (source_name, note)
select distinct source_name, '011 시드: 2026-08-22 활성 출처'
from auditions where is_active and source_name is not null
on conflict (source_name) do nothing;

create table if not exists source_candidates (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,            -- 도메인 또는 계정 URL (https://example.com, https://www.instagram.com/acct/)
  kind text not null,                  -- domain | instagram | threads | x | kakao_channel | cafe
  found_by text,                       -- 'naver_webkr:키워드', 'instagram_explore:오디션 공고' …
  hits integer default 1,
  sample_title text,
  status text default 'new' check (status in ('new', 'approved', 'rejected')),
  first_seen timestamptz default now(),
  last_seen timestamptz default now()
);
create index if not exists idx_source_candidates_status on source_candidates(status, hits desc);
