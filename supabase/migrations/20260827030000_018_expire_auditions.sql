-- ============================================
-- 018 — 만료 처리 일원화 (30 마스터플랜 2-4)
-- Supabase SQL 편집기 또는 `supabase db push --linked` 로 실행.
--
-- 문제: 만료 판정이 세 곳에 흩어져 있었다.
--   ① pg_cron `deactivate_expired_auditions()`  (003, 매일 1회 — 마감 지난 것만)
--   ② crawler/main.py `deactivate_expired()` + `deactivate_stale_undated()` ×2
--   ③ 어느 쪽도 커버하지 않는 경로: `tools/ingest.py`가 크롤러 **종료 뒤** 마감일을 채우는데,
--      채운 값이 이미 과거여도 비활성화되지 않았다(실측: 캐스팅114 2건이 마감 지난 채 활성).
--
-- 해결: 판정을 이 함수 하나로 모으고, 파이썬·pg_cron 양쪽이 같은 함수를 부른다.
--   규칙이 하나면 새 경로가 생겨도 "그 함수를 부르면 끝"이 된다.
-- ============================================

-- 1. 만료 처리 통합 함수
--    · 마감 지난 공고
--    · 마감 미상인데 마지막 수집 후 undated_days 경과 (좀비 방지 — 2026-08-21 실측 1,691건)
--    · 검색형 출처(네이버카페 등)는 더 짧게
create or replace function expire_auditions(
  undated_days integer default 45,
  search_prefix text default '네이버카페',
  search_undated_days integer default 30
)
returns table(expired integer, stale integer, stale_search integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  n_expired integer;
  n_stale integer;
  n_search integer;
begin
  update auditions
  set is_active = false
  where is_active = true and deadline is not null and deadline < current_date;
  get diagnostics n_expired = row_count;

  -- 검색형을 먼저 처리한다(더 짧은 기준). 전 소스 규칙과 겹치는 행을 두 번 세지 않기 위함.
  update auditions
  set is_active = false
  where is_active = true
    and deadline is null
    and source_name like search_prefix || '%'
    and crawled_at < now() - make_interval(days => search_undated_days);
  get diagnostics n_search = row_count;

  update auditions
  set is_active = false
  where is_active = true
    and deadline is null
    and crawled_at < now() - make_interval(days => undated_days);
  get diagnostics n_stale = row_count;

  return query select n_expired, n_stale, n_search;
end;
$$;

comment on function expire_auditions is
  '만료 처리 정본 (018). 크롤러·ingest·pg_cron이 모두 이 함수를 부른다. 규칙을 바꿀 곳은 여기 하나.';

-- 2. pg_cron 등록 — 크롤러가 안 돌아도(PC 꺼짐) 만료가 진행되게 하는 안전망.
--    실측 2026-08-27: 003이 라이브에 적용된 적이 없어 `cron` 스키마 자체가 없었다.
--    = 자동 만료는 처음부터 돌지 않았고 파이썬 경로만 동작 중이었다.
--    확장 생성 권한이 없는 환경에서도 위 함수는 남도록 통째로 예외를 삼킨다.
do $cron$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('deactivate-expired-auditions')
  where exists (select 1 from cron.job where jobname = 'deactivate-expired-auditions');

  perform cron.unschedule('expire-auditions')
  where exists (select 1 from cron.job where jobname = 'expire-auditions');

  perform cron.schedule(
    'expire-auditions',
    '5 15 * * *',                      -- UTC 15:05 = KST 00:05
    $job$select expire_auditions()$job$
  );
  raise notice 'pg_cron: expire-auditions 등록 완료';
exception when others then
  raise notice 'pg_cron 등록 건너뜀 (%). 만료는 크롤러 실행 시 expire_auditions() 호출로 처리된다.', sqlerrm;
end
$cron$;

-- 3. 003의 옛 함수는 남겨두면 다시 불릴 수 있으므로 제거
drop function if exists deactivate_expired_auditions();
