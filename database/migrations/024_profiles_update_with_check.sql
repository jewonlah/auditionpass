-- ============================================
-- 024 — profiles UPDATE 정책에 with check 추가 (행 소유자 변경 차단)
-- 근거: 001_initial_schema.sql:109 · 적대적 리뷰 2026-09-04 확정 결함 D2
--
-- 문제: 001 의 `create policy "본인 프로필 수정" on profiles for update
--   using (auth.uid() = id)` 는 **읽는 행**만 제한하고 **쓴 뒤의 행**을 검사하지 않는다.
--   Postgres RLS 에서 UPDATE 의 with check 가 없으면 using 이 대신 쓰이지 않고 무검사다.
--   따라서 로그인 사용자가 `PUT /api/profile {"id": "<타인 uuid>"}` 로 자기 프로필 행의
--   id 를 남의 uuid 로 바꿔 그 사람의 프로필 행을 밀어낼 수 있다(개인정보 오염·탈취).
--
-- 해결: 같은 정책을 drop 후 `using` + `with check` 양쪽에 `auth.uid() = id` 로 재생성한다.
--
-- 백업: **불필요.** 정책 교체만이며 어떤 행도 UPDATE/DELETE 하지 않는다.
--
-- 적용: supabase db push --linked        ← 소유자 승인 후에만
--   (CLI 사본: supabase/migrations/20260904010000_profiles_update_with_check.sql)
--
-- ⚠️ 적용 전까지 라이브에서는 DB 차원의 방어가 없다.
--    app/api/profile 의 stripServerColumns() 가 id·created_at·updated_at 를 본문에서
--    제거하므로 이 라우트 경유 공격은 막히지만, **anon 키로 supabase-js 를 직접 호출하는
--    경로는 024 적용 후에만 막힌다.**
--
-- 정상 사용자 영향: 없음. 본인 행의 id 를 바꾸지 않는 한 with check 는 항상 참이다.
-- ============================================

drop policy if exists "본인 프로필 수정" on profiles;

create policy "본인 프로필 수정" on profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 멱등성: drop policy if exists 로 재실행해도 중복 생성되지 않는다.

-- 롤백 (되돌리려면 — 결함을 되살리는 것이므로 권장하지 않는다):
--   drop policy if exists "본인 프로필 수정" on profiles;
--   create policy "본인 프로필 수정" on profiles for update using (auth.uid() = id);
