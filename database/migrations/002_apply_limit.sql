-- ============================================
-- 하루 지원 제한 로직 개선
-- 기본 1회 + 광고 최대 3회 = 하루 최대 4회
-- ============================================

-- ad_bonus 최대 3 제한 (기존 데이터 보호를 위해 조건부 추가)
alter table daily_apply_count
  add constraint daily_apply_count_ad_bonus_max check (ad_bonus >= 0 and ad_bonus <= 3);

-- ============================================
-- can_apply_today: 오늘 지원 가능 여부
-- 무료 유저: count < (1 + ad_bonus) 이면 가능
-- 유료 유저: 무제한
-- ============================================
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

  -- 기록 없으면 지원 가능 (0 < 1+0)
  if not found then return true; end if;

  -- 기본 1회 + 광고 보너스 (최대 3)
  return v_count < (1 + least(v_ad_bonus, 3));
end;
$$ language plpgsql security definer;

-- ============================================
-- get_daily_apply_status: 오늘 지원 현황 조회
-- 프론트엔드에서 남은 횟수 표시용
-- ============================================
create or replace function get_daily_apply_status(p_user_id uuid)
returns json as $$
declare
  v_plan text;
  v_count integer;
  v_ad_bonus integer;
  v_max_applies integer;
  v_can_apply boolean;
  v_can_watch_ad boolean;
begin
  -- 구독 플랜 확인
  select plan into v_plan
  from subscriptions
  where user_id = p_user_id and status = 'active'
  order by created_at desc limit 1;

  -- 유료 구독자
  if v_plan in ('basic', 'pro') then
    return json_build_object(
      'plan', v_plan,
      'count', 0,
      'ad_bonus', 0,
      'max_applies', -1,
      'remaining', -1,
      'can_apply', true,
      'can_watch_ad', false
    );
  end if;

  -- 무료 유저
  select count, ad_bonus into v_count, v_ad_bonus
  from daily_apply_count
  where user_id = p_user_id and apply_date = current_date;

  if not found then
    v_count := 0;
    v_ad_bonus := 0;
  end if;

  v_max_applies := 1 + least(v_ad_bonus, 3);
  v_can_apply := v_count < v_max_applies;
  v_can_watch_ad := v_ad_bonus < 3;

  return json_build_object(
    'plan', coalesce(v_plan, 'free'),
    'count', v_count,
    'ad_bonus', v_ad_bonus,
    'max_applies', v_max_applies,
    'remaining', greatest(v_max_applies - v_count, 0),
    'can_apply', v_can_apply,
    'can_watch_ad', v_can_watch_ad
  );
end;
$$ language plpgsql security definer;

-- ============================================
-- increment_apply_count: 지원 횟수 +1 (기존 함수 교체)
-- ============================================
create or replace function increment_apply_count(p_user_id uuid)
returns void as $$
begin
  insert into daily_apply_count (user_id, apply_date, count, ad_bonus)
  values (p_user_id, current_date, 1, 0)
  on conflict (user_id, apply_date)
  do update set count = daily_apply_count.count + 1;
end;
$$ language plpgsql security definer;

-- ============================================
-- increment_ad_bonus: 광고 보너스 +1 (최대 3)
-- 이미 3이면 아무 일도 일어나지 않음
-- ============================================
create or replace function increment_ad_bonus(p_user_id uuid)
returns json as $$
declare
  v_ad_bonus integer;
begin
  -- upsert: 레코드 없으면 생성, 있으면 ad_bonus +1 (3 미만일 때만)
  insert into daily_apply_count (user_id, apply_date, count, ad_bonus)
  values (p_user_id, current_date, 0, 1)
  on conflict (user_id, apply_date)
  do update set ad_bonus = least(daily_apply_count.ad_bonus + 1, 3)
  where daily_apply_count.ad_bonus < 3
  returning ad_bonus into v_ad_bonus;

  -- 변경이 없었으면 (이미 3) 현재 값 조회
  if v_ad_bonus is null then
    select ad_bonus into v_ad_bonus
    from daily_apply_count
    where user_id = p_user_id and apply_date = current_date;
  end if;

  return json_build_object(
    'ad_bonus', coalesce(v_ad_bonus, 0),
    'max_ad_bonus', 3,
    'can_watch_more', coalesce(v_ad_bonus, 0) < 3
  );
end;
$$ language plpgsql security definer;
