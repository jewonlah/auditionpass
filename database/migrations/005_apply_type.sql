-- ============================================
-- 지원 유형 분류 (email / external)
-- Supabase SQL 편집기에서 실행
-- ============================================

-- 1. apply_type 컬럼 추가
alter table auditions
  add column if not exists apply_type text not null default 'external'
  check (apply_type in ('email', 'external'));

-- 2. 기존 데이터 일괄 분류: apply_email 있으면 'email'
update auditions
set apply_type = 'email'
where apply_email is not null and apply_email != '';
