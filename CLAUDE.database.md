# DB 에이전트 — Supabase 스키마 & 마이그레이션

> 2026-08-18 재작성. 마이그레이션은 `database/migrations/001~009` 순서 적용이 정본. **`daily_apply_count`·지원 제한 함수는 009에서 DROP**, `subscriptions`는 미사용 잔존(신규 로직 금지, R3 결제 재설계 시 신규 스키마).

## 역할
스키마 설계, `database/migrations/NNN_*.sql` 작성(Supabase SQL 편집기 실행 전제), RLS·인덱스·pg_cron. 마이그레이션 거버넌스는 Phase 2-7에서 Supabase CLI로 전환 예정 — 그 전까지 **적용 여부를 파일만 보고 단정하지 말고 실측**(information_schema 조회).

## 마이그레이션 이력
| 파일 | 내용 | 적용 |
|---|---|---|
| 001_initial_schema | profiles·auditions·applications·subscriptions·daily_apply_count + RLS | ✅ |
| 002_apply_limit | 지원 제한 함수(폐지 대상) | ✅ |
| 003_auto_deactivate_expired | pg_cron `deactivate_expired_auditions()` | ✅ |
| 004_profile_extra_fields | profiles.activity_field·agency·specialty·career | ✅ |
| 005_apply_type | auditions.apply_type ('email'\|'external') | ✅ |
| 006_community | community_posts·comments·likes + RLS + 인덱스 | ✅ |
| 007_category_system | auditions.category·sub_category·category_confidence·classify_method, genre CHECK 15종 | ✅ (컬럼만 — 분류기 미연결, Phase 2-1) |
| 008_crawl_logs | crawl_logs (미기록 상태, Phase 2-4) | ✅ |
| **009_renewal_apply_flow** | profiles.birth_year(+age nullable) · applications.status/opened_at · **bookmarks** · daily_apply_count·함수 DROP | ❓ **적용 여부 미확인 — 배포 게이트 (30 §2 0-3)** |

## 현행 테이블 요약
```sql
profiles        id(auth.users FK) name birth_year age(deprecated) gender height weight bio photo_urls[]
                instagram_url youtube_url other_url genre[] activity_field[] agency specialty[] career phone
auditions       id title company genre(15종) category sub_category category_confidence classify_method
                deadline apply_email apply_type description requirements source_url source_name is_active crawled_at
applications    id user_id audition_id email_sent sent_at status('sent'|'failed'|'replied') opened_at  unique(user,audition)
bookmarks       id user_id audition_id created_at  unique(user,audition)          -- 009
community_posts / community_comments / community_likes                            -- 006
crawl_logs      run_date source_name total_collected total_saved duplicates_skipped … ai_tokens_used errors  -- 008
subscriptions   (잔존·미사용)
```
- 나이는 **`birth_year` 정본**(1940~2015 CHECK). `age`는 백필된 구 데이터 폴백, F4 온보딩 완료 후 제거 검토.
- `applications.opened_at`은 R1.2 Resend open tracking 예약 — **유저에게 노출 금지**(D2 과금 후보).
- 카테고리 14개(007 genre CHECK에서 '기타' 제외)는 `frontend/src/lib/profile.ts PROFILE_GENRES`와 동일 문자열이어야 함.

## RLS 원칙
- profiles/applications/bookmarks/community_likes: 본인 행만 (`auth.uid() = user_id`)
- auditions: 전체 select 공개, 쓰기는 service_role(크롤러)만
- community_posts/comments: `is_active = true` 공개 조회, 본인 insert/update
- 새 테이블은 반드시 `enable row level security` + 정책 3종(select/insert/delete) 세트로

## 규칙
- 파일명 `NNN_snake_case.sql`, 상단 주석에 근거 정본 번호(예: `-- 근거: 11 PRD F6`)
- `add column if not exists` / `create table if not exists` 멱등 작성
- DROP·데이터 변형 마이그레이션은 **적용 전 대상 테이블 백업 덤프** 절차를 주석으로 명시
- 인덱스는 조회 패턴 근거와 함께 (예: `idx_auditions_category` — 카테고리 필터·SEO 랜딩)
- 이 문서에 폐지된 예제 SQL(지원 제한 함수 등)을 되살리지 말 것

## 예정 작업
- 2-1 분류기 연결 후 category 4컬럼 실저장 확인 쿼리
- 2-3 인코딩 손상 `source_name` 레코드 정정
- 2-7 Supabase CLI 마이그레이션 전환, profiles.phone 드리프트 정리
- R2: `boards`(토큰) / R3: 결제 신규 스키마(payments·webhook·갱신)

## 작업 지시 예시
```
CLAUDE.database.md를 참조해서:
1. 009 적용 여부를 확인하는 조회 SQL(information_schema.columns / tables)을 만들어줘
2. 010: 카테고리별 SEO 랜딩용 인덱스·뷰를 설계해줘 (근거: 12 §1.2)
```
