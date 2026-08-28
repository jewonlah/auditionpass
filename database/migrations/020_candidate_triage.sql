-- 020. 소스 후보 AI 분류 결과 컬럼 (2026-08-28)
--
-- 배경: source_candidates 에 status='new' 604건이 검수 화면 없이 방치됨.
-- 국립극단(ntck.or.kr)·세종문화회관(sejongpac.or.kr)·콘테스트코리아(발견 1,213회) 같은
-- 우량 소스가 대기열에 묻혀 있었다. tools/classify_candidates.py(DeepSeek V4-Flash)가
-- 3분류(approve/reject/review)한 결과를 여기에 적재하고 /admin/candidates 에서 보여준다.
--
-- AI 판정은 **제안일 뿐** 이다. status 는 사람이 승인/거부할 때만 바뀐다.

alter table source_candidates add column if not exists ai_verdict text;       -- approve | reject | review
alter table source_candidates add column if not exists ai_source_type text;   -- 공공기관 · 전문캐스팅사이트 · ...
alter table source_candidates add column if not exists ai_reason text;        -- 한 줄 근거
alter table source_candidates add column if not exists ai_risk text;          -- none | low | medium | high
alter table source_candidates add column if not exists ai_classified_at timestamptz;

-- 검수 화면 기본 정렬: 미처리(new) 중 발견 횟수 많은 순
create index if not exists idx_source_candidates_triage
  on source_candidates (status, hits desc);

-- AI 판정별 필터
create index if not exists idx_source_candidates_verdict
  on source_candidates (ai_verdict) where status = 'new';

comment on column source_candidates.ai_verdict is
  'DeepSeek 자동 분류 제안 (approve/reject/review). 실제 승인은 사람이 status 로 결정한다.';

-- 2026-08-28 추가: 발견 큐가 이미 수집 중인 도메인을 중복으로 올리고 있었다
-- (1위 contestkorea.com 1,213회·2위 ohtalk.net 641회 둘 다 generic_board 로 이미 수집 중).
-- covered_by 에 근거 라벨을 채워 승인 대상에서 걸러낸다. tools/mark_covered.py 가 채운다.
alter table source_candidates add column if not exists covered_by text;
create index if not exists idx_source_candidates_covered
  on source_candidates (covered_by) where status = 'new';
comment on column source_candidates.covered_by is
  '이미 수집 중인 출처임을 나타내는 근거 라벨. 값이 있으면 승인 대상이 아니다(중복).';
