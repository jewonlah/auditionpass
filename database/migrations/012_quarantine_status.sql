-- 012: review_status에 'quarantine' 추가 (플랜 37 auto-triage / 36 §4 위험 격리)
--  - quarantine: 위험 신호(비용 징수·성인·신분증 요구·미성년+위험 조합)로 자동 격리, 비활성.
--    rejected(운영자 거절)와 구분해 격리 사유 검수·통계를 가능하게 한다.
--  - 멱등. 적용 후 crawler/utils/supabase_client.py 의 QUARANTINE_STATUS 를 'quarantine'으로 변경할 것.

alter table auditions drop constraint if exists auditions_review_status_check;
alter table auditions add constraint auditions_review_status_check
  check (review_status in ('auto', 'pending', 'approved', 'rejected', 'quarantine'));

create index if not exists idx_auditions_review_quarantine
  on auditions(created_at desc) where review_status = 'quarantine';

-- 확인:
--   select review_status, count(*) from auditions group by 1;
