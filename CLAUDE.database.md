# DB 에이전트 — Supabase 스키마 & 마이그레이션

## 역할
Supabase 데이터베이스 스키마 설계, 마이그레이션 파일 생성, RLS 정책 설정.

## 테이블 정의

### 1. profiles (유저 프로필)
```sql
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
```

### 2. subscriptions (구독 정보)
```sql
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
```

### 3. auditions (오디션 공고)
```sql
create table auditions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text,
  genre text not null check (genre in ('배우', '모델', '기타')),
  deadline date,
  apply_email text,
  description text,
  requirements text,
  source_url text,
  source_name text, -- 크롤링 출처 (씨엔씨캐스팅 등)
  is_active boolean default true,
  crawled_at timestamptz default now(),
  created_at timestamptz default now()
);
```

### 4. applications (지원 이력)
```sql
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audition_id uuid not null references auditions(id) on delete cascade,
  email_sent boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, audition_id) -- 중복 지원 방지
);
```

### 5. daily_apply_count (일일 지원 횟수 제한)
```sql
create table daily_apply_count (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  apply_date date not null default current_date,
  count integer default 0,
  ad_bonus integer default 0, -- 광고 시청으로 획득한 추가 지원 횟수
  unique(user_id, apply_date)
);
```

## RLS 정책

```sql
-- profiles: 본인만 읽기/쓰기
alter table profiles enable row level security;
create policy "본인 프로필 조회" on profiles for select using (auth.uid() = id);
create policy "본인 프로필 수정" on profiles for update using (auth.uid() = id);
create policy "본인 프로필 생성" on profiles for insert with check (auth.uid() = id);

-- auditions: 전체 공개 읽기, 쓰기는 service_role만
alter table auditions enable row level security;
create policy "오디션 전체 공개" on auditions for select using (true);

-- applications: 본인 이력만 조회
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
```

## 유용한 함수

```sql
-- 오늘 지원 가능 여부 확인 함수
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
```

## 작업 지시 예시
```
database/CLAUDE.md를 참조해서:
1. Supabase SQL 편집기에서 실행할 마이그레이션 파일을 생성해줘
2. 파일명: database/migrations/001_initial_schema.sql
```
