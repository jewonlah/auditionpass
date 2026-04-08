-- ============================================
-- 오디션 카테고리 시스템 확장
-- ============================================

-- 1. auditions 테이블에 카테고리 필드 추가
alter table auditions add column if not exists category text;
alter table auditions add column if not exists sub_category text;
alter table auditions add column if not exists category_confidence real default 0;
alter table auditions add column if not exists classify_method text default 'keyword';

-- 2. genre 체크 제약 조건 확장 (기존: 배우/모델/기타 → 14개 카테고리 추가)
alter table auditions drop constraint if exists auditions_genre_check;
alter table auditions add constraint auditions_genre_check
  check (genre in ('배우', '모델', '기타', '아이돌', '키즈모델', '가수', '트로트', '촬영모델', '뮤지컬', '연극', '성우', '댄서', 'MC/진행자', '엑스트라', '인플루언서'));

-- 3. 인덱스
create index if not exists idx_auditions_category on auditions(category);

-- 4. 기존 데이터 category 필드 채우기 (genre → category 매핑)
update auditions set category = genre where category is null;
