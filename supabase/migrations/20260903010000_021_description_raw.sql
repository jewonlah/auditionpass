-- ============================================
-- 021 — 공고 원문 보존 (auditions.description_raw)
-- 근거: 37 auto-triage §2 위험 판정 / Codex 교차 리뷰 2026-09-02
-- Supabase SQL 편집기 또는 `supabase db push --linked` 로 실행. 멱등.
--
-- 왜 필요한가:
--   크롤러(utils/supabase_client.py)가 긴 본문을 요약·정제해 `description`에 **덮어써** 저장한다.
--   원문 컬럼이 없어 복구가 불가능하고, 더 나쁜 것은 사후 위험 판정
--   (tools/quarantine_sweep.py · frontend/src/lib/admin/gate.ts)이 그 **요약본**을 읽는다는 점이다.
--   요약에서 "참가비 20만원 입금" 한 줄이 빠지면 스캠 게이트가 그대로 통과된다.
--   → 정제가 본문을 실제로 바꾼 경우에만 원문을 여기에 남기고, 위험 판정은 원문을 본다.
--
-- 백필하지 않는다: 기존 행은 원문이 이미 유실됐다(되살릴 소스가 없다).
--   따라서 판정부는 `description_raw or description` 폴백으로 동작해야 한다.
-- 인덱스 없음: 조회·필터 대상이 아니라 판정 입력 전용 텍스트 컬럼이다.
-- DROP·데이터 변형 없음 — 백업 덤프 불필요(순수 additive).
-- ============================================

alter table auditions add column if not exists description_raw text;

comment on column auditions.description_raw is
  '정제·요약 전 원문 본문. 정제가 description을 실제로 바꾼 경우에만 채워진다(같으면 null). 위험 판정(risk_score)·어드민 게이트는 description_raw를 우선 사용하고 없으면 description으로 폴백한다. 021';
