-- ============================================
-- 커뮤니티 테이블
-- ============================================

-- 1. community_posts (게시글)
create table community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('자유', '꿀팁', '후기', '질문', '구인')),
  title text not null,
  content text not null,
  likes_count integer default 0,
  comments_count integer default 0,
  views_count integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. community_comments (댓글 + 대댓글)
create table community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references community_comments(id) on delete cascade, -- null이면 댓글, 있으면 대댓글
  content text not null,
  likes_count integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 3. community_likes (좋아요 — 게시글 + 댓글 겸용)
create table community_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references community_posts(id) on delete cascade,
  comment_id uuid references community_comments(id) on delete cascade,
  created_at timestamptz default now(),
  -- 게시글 또는 댓글 중 하나만
  check (
    (post_id is not null and comment_id is null) or
    (post_id is null and comment_id is not null)
  ),
  -- 중복 좋아요 방지
  unique(user_id, post_id),
  unique(user_id, comment_id)
);

-- ============================================
-- 인덱스
-- ============================================

create index idx_community_posts_user on community_posts(user_id);
create index idx_community_posts_category on community_posts(category);
create index idx_community_posts_created on community_posts(created_at desc);
create index idx_community_posts_likes on community_posts(likes_count desc);
create index idx_community_comments_post on community_comments(post_id);
create index idx_community_comments_parent on community_comments(parent_id);
create index idx_community_likes_post on community_likes(post_id);
create index idx_community_likes_comment on community_likes(comment_id);

-- ============================================
-- 트리거: updated_at 자동 갱신
-- ============================================

create trigger community_posts_updated_at
  before update on community_posts
  for each row execute function update_updated_at();

-- ============================================
-- RLS 정책
-- ============================================

-- community_posts
alter table community_posts enable row level security;
create policy "게시글 전체 공개 조회" on community_posts for select using (is_active = true);
create policy "본인 게시글 생성" on community_posts for insert with check (auth.uid() = user_id);
create policy "본인 게시글 수정" on community_posts for update using (auth.uid() = user_id);
create policy "본인 게시글 삭제" on community_posts for delete using (auth.uid() = user_id);

-- community_comments
alter table community_comments enable row level security;
create policy "댓글 전체 공개 조회" on community_comments for select using (is_active = true);
create policy "본인 댓글 생성" on community_comments for insert with check (auth.uid() = user_id);
create policy "본인 댓글 수정" on community_comments for update using (auth.uid() = user_id);
create policy "본인 댓글 삭제" on community_comments for delete using (auth.uid() = user_id);

-- community_likes
alter table community_likes enable row level security;
create policy "좋아요 조회" on community_likes for select using (true);
create policy "본인 좋아요 생성" on community_likes for insert with check (auth.uid() = user_id);
create policy "본인 좋아요 삭제" on community_likes for delete using (auth.uid() = user_id);

-- ============================================
-- 유틸리티 함수
-- ============================================

-- 조회수 증가
create or replace function increment_post_views(p_post_id uuid)
returns void as $$
begin
  update community_posts set views_count = views_count + 1 where id = p_post_id;
end;
$$ language plpgsql security definer;

-- 좋아요 증가
create or replace function increment_post_likes(p_post_id uuid)
returns void as $$
begin
  update community_posts set likes_count = likes_count + 1 where id = p_post_id;
end;
$$ language plpgsql security definer;

-- 좋아요 감소
create or replace function decrement_post_likes(p_post_id uuid)
returns void as $$
begin
  update community_posts set likes_count = greatest(likes_count - 1, 0) where id = p_post_id;
end;
$$ language plpgsql security definer;

-- 댓글 수 증가
create or replace function increment_post_comments(p_post_id uuid)
returns void as $$
begin
  update community_posts set comments_count = comments_count + 1 where id = p_post_id;
end;
$$ language plpgsql security definer;
