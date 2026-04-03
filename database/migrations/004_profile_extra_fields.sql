-- ============================================
-- 프로필 추가 필드 (캐스팅 실무 정보)
-- Supabase SQL 편집기에서 실행
-- ============================================

alter table profiles
  add column if not exists activity_field text[] default '{}',
  add column if not exists agency text,
  add column if not exists specialty text[] default '{}',
  add column if not exists career text;
