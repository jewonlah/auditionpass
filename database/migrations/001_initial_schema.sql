-- ============================================
-- AuditionPass 초기 스키마
-- Supabase SQL 편집기에서 실행
-- ============================================

-- 1. profiles (유저 프로필)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  age integer not null check (age >= 14 and age <= 80),
  gender text not null check (gender in ('남성', '여성', '기타')),
  height integer, -- cm
  weight integer, -- kg
  bio text,
  photo_urls text[] default '{}',
  instagram_url text,
  youtube_url text,
  other_url text,
  genre text[] default '{}', -- ['배우', '모델']
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. subscriptions (구독 정보)
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'basic', 'pro')),
  status text not null check (status in ('active', 'cancelled', 'expired')),
  started_at timestamptz default now(),
  expires_at timestamptz,
  toss_order_id text,
  created_at timestamptz default now()
);

-- 3. auditions (오디션 공고)
create table auditions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text,
  genre text not null check (genre in ('배우', '모델', '기타')),
  deadline date,
  apply_email text,
  description text,
  requirements text,
  source_url text unique, -- 크롤러 upsert용 unique 제약
  source_name text,       -- 크롤링 출처 (씨엔씨캐스팅 등)
  is_active boolean default true,
  crawled_at timestamptz default now(),
  created_at timestamptz default now()
);

-- 4. applications (지원 이력)
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audition_id uuid not null references auditions(id) on delete cascade,
  email_sent boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, audition_id) -- 중복 지원 방지
);

-- 5. daily_apply_count (일일 지원 횟수 제한)
create table daily_apply_count (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  apply_date date not null default current_date,
  count integer default 0,
  ad_bonus integer default 0, -- 광고 시청으로 획득한 추가 지원 횟수
  unique(user_id, apply_date)
);

-- ============================================
-- 인덱스
-- ============================================

create index idx_auditions_genre on auditions(genre);
create index idx_auditions_deadline on auditions(deadline);
create index idx_auditions_is_active on auditions(is_active);
create index idx_applications_user_id on applications(user_id);
create index idx_applications_audition_id on applications(audition_id);
create index idx_subscriptions_user_id on subscriptions(user_id);
create index idx_daily_apply_count_user_date on daily_apply_count(user_id, apply_date);

-- ============================================
-- updated_at 자동 갱신 트리거
-- ============================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ============================================
-- RLS 정책
-- ============================================

-- profiles: 본인만 읽기/쓰기
alter table profiles enable row level security;
create policy "본인 프로필 조회" on profiles for select using (auth.uid() = id);
create policy "본인 프로필 수정" on profiles for update using (auth.uid() = id);
create policy "본인 프로필 생성" on profiles for insert with check (auth.uid() = id);

-- auditions: 전체 공개 읽기, 쓰기는 service_role만
alter table auditions enable row level security;
create policy "오디션 전체 공개" on auditions for select using (true);

-- applications: 본인 이력만 조회/생성
alter table applications enable row level security;
create policy "본인 지원 이력 조회" on applications for select using (auth.uid() = user_id);
create policy "본인 지원 생성" on applications for insert with check (auth.uid() = user_id);

-- daily_apply_count: 본인만
alter table daily_apply_count enable row level security;
create policy "본인 횟수 조회" on daily_apply_count for select using (auth.uid() = user_id);
create policy "본인 횟수 생성" on daily_apply_count for insert with check (auth.uid() = user_id);
create policy "본인 횟수 수정" on daily_apply_count for update using (auth.uid() = user_id);

-- subscriptions: 본인만
alter table subscriptions enable row level security;
create policy "본인 구독 조회" on subscriptions for select using (auth.uid() = user_id);

-- ============================================
-- 유틸리티 함수
-- ============================================

-- 오늘 지원 가능 여부 확인
create or replace function can_apply_today(p_user_id uuid)
returns boolean as $$
declare
  v_plan text;
  v_count integer;
  v_ad_bonus integer;
begin
  -- 구독 플랜 확인
  select plan into v_plan
  from subscriptions
  where user_id = p_user_id and status = 'active'
  order by created_at desc limit 1;

  -- 유료 구독자는 무제한
  if v_plan in ('basic', 'pro') then
    return true;
  end if;

  -- 무료 유저: 오늘 횟수 확인
  select count, ad_bonus into v_count, v_ad_bonus
  from daily_apply_count
  where user_id = p_user_id and apply_date = current_date;

  -- 기록 없으면 지원 가능
  if not found then return true; end if;

  -- 기본 1회 + 광고 보너스
  return v_count < (1 + v_ad_bonus);
end;
$$ language plpgsql security definer;

-- 지원 횟수 증가
create or replace function increment_apply_count(p_user_id uuid)
returns void as $$
begin
  insert into daily_apply_count (user_id, apply_date, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, apply_date)
  do update set count = daily_apply_count.count + 1;
end;
$$ language plpgsql security definer;
