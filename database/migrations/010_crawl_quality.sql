-- ============================================
-- 010. 수집 품질·학습 인프라 (2026-08-22)
--  - crawl_logs.details: 소스별 세부 통계(JSON — 키워드별 수율, 제외 사유, 카페별 수율). 키워드/카페 자동 강등의 학습 데이터.
--  - auditions.quality_score: 0~1. 이메일·마감일·본문·출처 신뢰 가중 → "쓸 정보/버릴 정보" 분리 기준.
--  멱등. 백업 불필요(추가 전용).
-- ============================================

alter table crawl_logs add column if not exists details jsonb;
alter table auditions add column if not exists quality_score real default 0;

create index if not exists idx_auditions_quality on auditions(quality_score desc) where is_active;
