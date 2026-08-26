-- 017: 인테이크 잔여물 큐를 DB로 (플랜 39 §1 ⑤)
--
-- 지금까지 `tools.ingest process`가 규칙으로 못 푼 잔여물을 로컬 파일
-- `crawler/intake/agent_queue.json`에만 남겨서, 웹 어드민에서 볼 수 없었다.
-- 이 테이블이 정본이 되고, JSON은 기존 `/ingest` 스킬 흐름 호환을 위해 계속 함께 쓴다.
--
-- RLS 활성 + 정책 없음 = service role 전용 (크롤러 쓰기 · 어드민 API 읽기/처리).

create table if not exists agent_queue (
  id bigserial primary key,
  audition_id uuid not null references auditions(id) on delete cascade,
  title text,                 -- 스냅샷 (공고 삭제 후에도 목록에 남기기 위함)
  url text,
  reason text not null,       -- '원문 접근 실패' | '규칙 추출 실패(본문 있음)'
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  note text,                  -- 운영자 메모 (건너뛴 사유 등)
  resolved_by text,
  resolved_at timestamptz,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  -- 공고당 1행. process를 다시 돌려도 쌓이지 않고 last_seen만 갱신된다.
  unique (audition_id)
);

create index if not exists idx_agent_queue_open on agent_queue (last_seen desc) where status = 'open';

alter table agent_queue enable row level security;
