-- 014: suppression 긴급 차단 (플랜 39 §1 ④ · 36 §4 — R1b)
-- 이메일/도메인/소스 단위 차단. 등록 즉시 어드민 API가 매칭 활성 공고를 게시중지(sweep)한다.
-- 공용 메일 도메인(gmail.com 등)은 API 레벨에서 차단 금지 (36 §4).
-- RLS 활성 + 정책 없음 = service role 전용.

create table if not exists suppression (
  id bigserial primary key,
  kind text not null check (kind in ('email', 'domain', 'source')),
  value text not null,
  reason text not null,          -- 운영자 사유 필수
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

alter table suppression enable row level security;
