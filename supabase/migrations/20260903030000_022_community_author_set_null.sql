-- ============================================
-- 022 — 커뮤니티 작성자 FK를 ON DELETE SET NULL 로 전환
-- 근거: 11 PRD F3(회원 탈퇴 자기서비스) · 006_community 의 FK 결함
--       (Codex 교차 리뷰 2026-09-03 확정 결함 #1)
--
-- 문제: 006 에서 community_posts.user_id / community_comments.user_id 가
--   `references auth.users(id) on delete cascade` 다.
--   회원 탈퇴로 auth.users 행이 지워지면 탈퇴자의 게시글이 CASCADE 로 삭제되고,
--   community_comments.post_id 도 posts 에 CASCADE 라 **그 글에 달린 다른 사용자의
--   댓글까지 함께 사라진다.** 탈퇴자 한 명이 남의 기록을 지우는 구조다.
--
-- 해결: user_id 를 nullable 로 풀고 FK 를 ON DELETE SET NULL 로 재생성한다.
--   탈퇴 시 작성자 연결만 끊기고(익명화) 글·댓글 행과 스레드는 보존된다.
--
-- 백업: **불필요.** 구조 변경만이며 기존 행의 user_id 값은 그대로 유지된다.
--   (이 마이그레이션 자체는 어떤 행도 UPDATE/DELETE 하지 않는다)
--
-- 적용: supabase db push --linked        ← 소유자 승인 후에만
--   (CLI 사본: supabase/migrations/20260903010000_022_community_author_set_null.sql)
--
-- ⚠️ 적용 전까지 라이브에서는 CASCADE 가 그대로 발동한다.
--    app/api/account/delete 의 is_active=false 선처리는 노출을 먼저 멈출 뿐
--    행 삭제를 막지 못한다.
--
-- ⚠️ 후속(다른 담당): user_id 가 null 인 글·댓글의 작성자 표기를 "탈퇴한 회원"으로
--    렌더하는 프론트 처리. 이 마이그레이션만으로는 작성자 조회가 빈 값이 된다.
--
-- RLS 영향: 정책 `auth.uid() = user_id` 는 user_id 가 null 이면 NULL(=false) 로 평가되어
--    아무도 수정·삭제할 수 없다 — 의도한 동작(주인 없는 글은 운영자만 처리).
--    공개 조회 정책은 `is_active = true` 기준이라 영향 없음.
-- ============================================

-- 1. community_posts.user_id
alter table community_posts alter column user_id drop not null;

do $$
declare
  v_name text;
begin
  -- FK 이름을 가정하지 않는다 — 006 은 SQL 편집기로 직접 적용돼 기본명일 가능성이 높지만
  -- (community_posts_user_id_fkey) 환경마다 다를 수 있어 pg_constraint 에서 찾아 지운다.
  for v_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and rel.relname = 'community_posts'
      and con.conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.community_posts'::regclass and attname = 'user_id')
      ]::smallint[]
  loop
    execute format('alter table public.community_posts drop constraint %I', v_name);
  end loop;
end $$;

alter table community_posts
  add constraint community_posts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 2. community_comments.user_id
alter table community_comments alter column user_id drop not null;

do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and rel.relname = 'community_comments'
      and con.conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.community_comments'::regclass and attname = 'user_id')
      ]::smallint[]
  loop
    execute format('alter table public.community_comments drop constraint %I', v_name);
  end loop;
end $$;

alter table community_comments
  add constraint community_comments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 멱등성: 재실행하면 drop not null 은 no-op, FK 는 위 DO 블록이 이름과 무관하게
-- 먼저 제거하므로 add constraint 가 중복되지 않는다.

-- 롤백 (되돌리려면):
--   update community_posts set is_active = false where user_id is null;      -- 고아 글 정리 판단 후
--   alter table community_posts drop constraint community_posts_user_id_fkey;
--   alter table community_posts add constraint community_posts_user_id_fkey
--     foreign key (user_id) references auth.users(id) on delete cascade;
--   -- not null 복원은 user_id is null 인 행을 먼저 처리해야 가능하다.
