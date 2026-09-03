-- ============================================
-- 023 — applications.status 에 'sending' 추가 (발송 전 선점)
-- 근거: 11 PRD F5 · Codex 교차 리뷰 2026-09-03 확정 결함 #2
--       (두 탭에서 동시에 원클릭 지원 → 메일 2통 발송)
--
-- 문제: /api/apply 가 "메일 발송 → applications upsert" 순서라
--   unique(user_id, audition_id) 가 발송 뒤에야 작동한다. 동시 요청 두 건이
--   모두 중복 검사를 통과해 캐스팅 담당자에게 같은 지원 메일이 두 번 나간다.
--
-- 해결: 발송 **전에** status:'sending' 행을 insert 로 선점한다.
--   unique 제약이 여기서 걸려 한 요청만 통과한다. 발송 후 sent/failed 로 갱신.
--
-- 백업: 불필요. CHECK 제약 교체만이며 기존 행 값은 건드리지 않는다
--   ('sending' 은 새 값이라 기존 데이터가 위반될 수 없다).
--
-- 적용: supabase db push --linked        ← 소유자 승인 후에만
--   (CLI 사본: supabase/migrations/20260903020000_023_applications_sending_status.sql)
--
-- ⚠️ 적용 전까지 라이브에서는 'sending' insert 가 23514(check_violation)로 실패한다.
--    app/api/apply 는 이를 감지해 선점을 건너뛰고 기존 동작(발송 후 upsert)으로
--    강등되므로 지원 기능이 멈추지는 않는다. 다만 **중복 발송 방어는 023 적용 후에만
--    유효하다.**
--
-- 유저 노출: 'sending' 은 과도 상태다. 지원 탭(F6)이 이 값을 "발송 중"으로 표시하거나
--    무시하도록 프론트가 처리한다. 정상 흐름에서는 수 초 안에 sent/failed 로 바뀐다.
-- ============================================

alter table applications drop constraint if exists applications_status_check;

alter table applications
  add constraint applications_status_check
  check (status in ('sending', 'sent', 'failed', 'replied'));

-- 프로세스가 발송 도중 강제 종료되면 'sending' 행이 남아 해당 공고 재지원이 막힌다.
-- 라우트가 try/catch 로 항상 sent/failed 로 마감하므로 정상 경로에서는 생기지 않는다.
-- 운영 중 잔여물 정리(수동, 필요 시):
--   update applications set status = 'failed', email_sent = false, sent_at = null
--   where status = 'sending' and created_at < now() - interval '1 hour';

-- 미발송 상태를 빠르게 찾기 위한 부분 인덱스 (위 정리 쿼리·운영 점검용)
create index if not exists idx_applications_sending
  on applications (created_at) where status = 'sending';

-- 롤백:
--   update applications set status = 'failed' where status = 'sending';
--   alter table applications drop constraint if exists applications_status_check;
--   alter table applications add constraint applications_status_check
--     check (status in ('sent', 'failed', 'replied'));
--   drop index if exists idx_applications_sending;
