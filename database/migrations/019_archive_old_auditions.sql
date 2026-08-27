-- ============================================
-- 019 — 지난 공고 본문 비우기 (보관 정리)
-- Supabase SQL 편집기 또는 `supabase db push --linked` 로 실행.
--
-- 삭제가 아니라 **본문만 비운다**. 행과 source_url은 남긴다.
-- 왜 삭제하지 않는가 (2026-08-27 실측 근거):
--   ① `applications`·`bookmarks`·`reports`가 `on delete cascade`다.
--      공고를 지우면 **유저의 지원 이력과 신고 이력이 함께 사라진다**.
--      신고가 사라지면 30일 신고 집계로 하는 소스 강등(39 §5)이 무력화된다 = 나쁜 출처 세탁.
--   ② 크롤러는 `source_url`로 중복을 판정한다. 행을 지우면 같은 공고가 **신규로 다시 저장**되어
--      되살아난다. 특히 네이버 카페는 검색이 과거 글도 계속 잡아온다.
--   ③ 용량 실익이 거의 없다. auditions 7,770행 텍스트 총량 ≈ 1.8MB(무료 한도 500MB의 0.35%).
--      2,540건을 전부 지워도 0.5MB 회수.
-- 그래서 되찾을 게 있는 부분(본문)만 비우고 판정 근거(행·URL·제목·마감)는 남긴다.
--
-- 화면 영향 없음: 상세 페이지는 `audition.description &&` 가드가 있고,
-- 지원 내역 API는 title·company·genre·deadline·is_active만 읽는다.
-- ============================================

create or replace function archive_old_auditions(
  after_days integer default 30,
  dry_run boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if dry_run then
    select count(*) into n
    from auditions
    where is_active = false
      and (description is not null or requirements is not null)
      and (
        (deadline is not null and deadline < current_date - after_days)
        or (deadline is null and crawled_at < now() - make_interval(days => after_days))
      );
    return n;
  end if;

  update auditions
  set description = null,
      requirements = null
  where is_active = false
    and (description is not null or requirements is not null)
    and (
      (deadline is not null and deadline < current_date - after_days)
      or (deadline is null and crawled_at < now() - make_interval(days => after_days))
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function archive_old_auditions is
  '지난 공고 본문 비우기 정본 (019). 행·source_url·제목·마감은 남긴다 — 지원/신고 이력(cascade)과 재수집 방지 때문. 멱등.';

-- pg_cron 등록 — 만료 처리(018, KST 00:05) 다음에 돈다
do $cron$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('archive-old-auditions')
  where exists (select 1 from cron.job where jobname = 'archive-old-auditions');

  perform cron.schedule(
    'archive-old-auditions',
    '20 15 * * *',                     -- UTC 15:20 = KST 00:20
    $job$select archive_old_auditions(30)$job$
  );
  raise notice 'pg_cron: archive-old-auditions 등록 완료';
exception when others then
  raise notice 'pg_cron 등록 건너뜀 (%). 수동 실행: select archive_old_auditions(30);', sqlerrm;
end
$cron$;
