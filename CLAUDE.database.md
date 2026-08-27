# DB 에이전트 — Supabase 스키마 & 마이그레이션

> 2026-08-26 갱신. 마이그레이션은 `database/migrations/001~017` 순서 적용이 정본. **`daily_apply_count`·지원 제한 함수는 009에서 DROP**, `subscriptions`는 미사용 잔존(신규 로직 금지, R3 결제 재설계 시 신규 스키마).

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
| 007_category_system | auditions.category·sub_category·category_confidence·classify_method, genre CHECK 15종 | ✅ **2026-08-21 적용 + 백필 완료**(2,630건, 활성 1,854건 14카테고리 실저장). 분류기 2-1 연결 완료. `category`=한글 라벨, `genre`=레거시 3분류 유지 |
| 008_crawl_logs | crawl_logs (Phase 2-4) | ✅ **적용됨 (2026-08-26 실측 — `crawl_logs.details` 존재).** 2026-08-21 "미적용" 기록은 그 뒤에 해소됨 |
| **009_renewal_apply_flow** | profiles.birth_year(+age nullable) · applications.status/opened_at · **bookmarks** · daily_apply_count·함수 DROP | ✅ **009a·009b 모두 적용 완료 (009b는 2026-08-27, `supabase db push`)**. 실측 7항목 통과 |
| 010_crawl_quality | crawl_logs.details · auditions.quality_score + 인덱스 | ✅ 2026-08-26 실측 |
| 011_review_queue | auditions.review_status · **trusted_sources** · **source_candidates** | ✅ 2026-08-26 실측 |
| 012_quarantine_status | review_status CHECK에 `quarantine` 추가 | ✅ 2026-08-25 적용 |
| 013_admin_actions | 어드민 액션 로그(prev/next 스냅샷·undo·`merge`/`unpublish` 포함) | ✅ 2026-08-26 적용 |
| 014_suppression | suppression 긴급 차단(email/domain/source, RLS 활성·정책 없음=service role 전용) | ✅ 2026-08-26 적용 |
| 015_reports | reports(사유 10종·SLA) · auditions.`oneclick_blocked` · auditions.`reports_count` | ✅ 2026-08-26 적용 |
| 016_reports_server_insert | reports INSERT 정책 제거 → 신고 삽입은 서버(service role) 전용 | ✅ 2026-08-26 적용 (Codex 교차 리뷰 P1) |
| **017_agent_queue** | 인테이크 잔여물 큐(공고당 1행, RLS 정책 없음=service role 전용) | ✅ 2026-08-27 적용 |
| **018_expire_auditions** | 만료 처리 정본 함수 `expire_auditions()` + pg_cron `expire-auditions` 등록, 003 옛 함수 제거 | ✅ 2026-08-27 적용. **003은 라이브에 적용된 적이 없어 `cron` 스키마가 없었다** — pg_cron 자동 만료는 018부터가 처음 |

> **CLI 마이그레이션 거버넌스 (2026-08-27 시작, 2-7 전환의 첫 발)**: 009b는 `supabase db push --linked`로 적용했다.
> 원격 `supabase_migrations.schema_migrations`에는 **009b 1건만** 기록돼 있고 001~017은 SQL 편집기로 직접 적용해 이력이 없다.
> 앞으로 `db push`를 다시 쓰기 전에 기존 마이그레이션을 `supabase migration repair --status applied <version>`으로 등록할 것 —
> 등록하지 않고 로컬 `supabase/migrations/`에 옛 파일을 넣으면 **이미 적용된 것을 재적용하려 든다**.

> **어드민 R1 배포 게이트: 충족됨.** 013~017 적용 완료 + `ADMIN_EMAILS` 설정 완료(2026-08-26).
> 상태 재확인은 `database/checks/migration_status.sql` 실행 — 전 행 `ok=true`가 정상.
> 마이그레이션이 빠진 환경에서는 각 화면이 크래시 대신 안내 문구로 강등된다.

## 현행 테이블 요약
```sql
profiles        id(auth.users FK) name birth_year age(deprecated) gender height weight bio photo_urls[]
                instagram_url youtube_url other_url genre[] activity_field[] agency specialty[] career phone
auditions       id title company genre(15종) category sub_category category_confidence classify_method
                deadline apply_email apply_type description requirements source_url source_name is_active crawled_at
                quality_score(010) review_status(011) oneclick_blocked(015) reports_count(015)
applications    id user_id audition_id email_sent sent_at status('sent'|'failed'|'replied') opened_at  unique(user,audition)
bookmarks       id user_id audition_id created_at  unique(user,audition)          -- 009
community_posts / community_comments / community_likes                            -- 006
crawl_logs      run_date source_name total_collected total_saved duplicates_skipped … ai_tokens_used errors  -- 008
trusted_sources source_name(PK) note trusted_at                                   -- 011 (자동 게재 허용 출처)
source_candidates id url(unique) kind found_by hits sample_title status           -- 011 (발견 큐)
admin_actions   id actor_email action audition_id audition_title prev next undone_by note created_at  -- 013
agent_queue     id audition_id(unique) title url reason status note resolved_by/at first_seen last_seen  -- 017
suppression     id kind('email'|'domain'|'source') value reason created_by  unique(kind,value)        -- 014
reports         id audition_id reporter_id reason(10종) severity status sla_due_at auto_action
                admin_note handled_by handled_at  unique(audition,reporter)       -- 015
subscriptions   (잔존·미사용)
```
- 나이는 **`birth_year` 정본**(1940~2015 CHECK). `age`는 백필된 구 데이터 폴백, F4 온보딩 완료 후 제거 검토.
- `applications.opened_at`은 R1.2 Resend open tracking 예약 — **유저에게 노출 금지**(D2 과금 후보).
- 카테고리 14개(007 genre CHECK에서 '기타' 제외)는 `frontend/src/lib/profile.ts PROFILE_GENRES`와 동일 문자열이어야 함.

## RLS 원칙
- profiles/applications/bookmarks/community_likes: 본인 행만 (`auth.uid() = user_id`)
- auditions: 전체 select 공개, 쓰기는 service_role(크롤러)만
- **reports**: 본인 신고 **select만** 허용. insert·update 모두 정책 없음 = service role 전용.
  insert를 클라이언트에 열어두면 `/api/report`의 사유→등급 매핑·SLA·24h 한도를 통째로 우회하므로 016에서 제거함 — 되살리지 말 것
- **admin_actions·suppression·agent_queue**: RLS 활성 + 정책 없음 = service role 전용. 어드민 게이트(`ADMIN_EMAILS`) 통과 후에만 접근
- community_posts/comments: `is_active = true` 공개 조회, 본인 insert/update
- 새 테이블은 반드시 `enable row level security` + 정책 3종(select/insert/delete) 세트로

## 규칙
- 파일명 `NNN_snake_case.sql`, 상단 주석에 근거 정본 번호(예: `-- 근거: 11 PRD F6`)
- `add column if not exists` / `create table if not exists` 멱등 작성
- DROP·데이터 변형 마이그레이션은 **적용 전 대상 테이블 백업 덤프** 절차를 주석으로 명시
- 인덱스는 조회 패턴 근거와 함께 (예: `idx_auditions_category` — 카테고리 필터·SEO 랜딩)
- 이 문서에 폐지된 예제 SQL(지원 제한 함수 등)을 되살리지 말 것

## 예정 작업
- 재분류가 필요하면 `crawler/scripts/backfill_categories.py`(dry-run 기본 → `--apply`, 멱등)
- 2-3 인코딩 손상 `source_name` 레코드 정정
- 2-7 Supabase CLI 마이그레이션 전환, profiles.phone 드리프트 정리
- R2: `boards`(토큰) / R3: 결제 신규 스키마(payments·webhook·갱신)

## 작업 지시 예시
```
CLAUDE.database.md를 참조해서:
1. 009 적용 여부를 확인하는 조회 SQL(information_schema.columns / tables)을 만들어줘
2. 010: 카테고리별 SEO 랜딩용 인덱스·뷰를 설계해줘 (근거: 12 §1.2)
```
