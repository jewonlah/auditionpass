# 백엔드 API 에이전트 — Next.js 16 API Routes

> 2026-08-18 재작성. 정본: `docs/renewal/11_prd.md` F5(지원)·F6(지원 탭)·F4(온보딩), `12_ia-userflows.md` §5·§6. 지원 횟수 제한·광고 보너스·결제 API는 **폐지**(00 D2·D8) — 다시 만들지 말 것.

## 역할
Next.js App Router `src/app/api/**/route.ts` 서버 로직. Supabase 서버 클라이언트(`@/lib/supabase/server`)로 인증·데이터, Resend로 메일. 인증 게이트는 `src/proxy.ts`(Next 16에서 middleware의 새 이름).

## 현행 엔드포인트 (실측)
| Method | Path | 상태 | 설명 |
|---|---|---|---|
| POST | `/api/apply` | ✅ | 원클릭 지원 — 미니 프로필 검증 → 중복 확인 → 메일 발송 → `applications` insert(`status:'sent'`) |
| GET | `/api/apply/check?auditionId=` | ✅ | 게이트 시트용: `{hasApplied, missingFields, profileSummary}` |
| GET | `/api/history` | ✅ | 지원 이력(→ 지원 탭 `/applications`) |
| GET/POST/PUT | `/api/profile` | ✅ | 프로필 CRUD |
| POST | `/api/profile/photos` | ✅ | Supabase Storage `profiles` 버킷 업로드 |
| GET/POST | `/api/community` | ✅ | 글 목록/작성 |
| GET/PUT/DELETE | `/api/community/[id]` | ✅ | 글 상세/수정/삭제 |
| POST | `/api/community/[id]/comments` | ✅ | 댓글·대댓글 |
| POST | `/api/community/[id]/like` | ✅ | 좋아요 토글 |
| GET | `/auth/callback` | ✅ | OAuth·이메일 공용 콜백, `returnTo` 쿼리 릴레이 |
| — | `/api/bookmarks` | 🔜 R1.1 F6 | 찜 토글/목록 (009 `bookmarks` 테이블) |
| — | `/api/onboarding` | 🔜 R1.1 F4 | 3스텝 저장(또는 `/api/profile` 부분 갱신으로 흡수) |
| — | `/api/board/[token]` | R2 D3 | 지원자 보드 읽기 전용 |

**삭제됨**: `/api/apply/ad-bonus`, `/api/apply/limit`, `/api/payment/*`.

## 핵심: POST `/api/apply` 처리 순서 (현행 코드 기준)
```
1. supabase.auth.getUser() → 없으면 401
2. body.auditionId 없으면 400
3. profiles 조회 → getMissingFields(profile) (@/lib/profile: name·birth_year·gender·genre)
   → 부족하면 400 { code:'INCOMPLETE_PROFILE', missingFields }   ← 프론트는 시트 ⓑ로 인라인 보완
4. applications(user_id, audition_id) 존재 → 409 { code:'ALREADY_APPLIED' }
5. auditions 조회 → 없으면 404, apply_email 없으면 400 (외부 지원형)
6. sendApplicationEmail({audition, profile})  — 실패 시 throw → 500 (status:'failed' 기록은 F6 후속)
7. applications insert { email_sent:true, sent_at, status:'sent' }
8. 200 { success:true }
```
- **지원 횟수 제한 없음** (D2). 스팸 방어는 비노출 rate limit + 중복 차단 + 발송 실패율 가드레일로 (30 §4).
- 응답 `code`는 프론트 ApplyButton 상태머신의 분기 키 — 이름 바꾸지 말 것.

## 인증 게이트 (`src/proxy.ts`)
- 보호 경로: `/home`, `/applications`, `/profile`, `/my` (+ `/onboarding` 신설 시 추가)
- 비로그인 → `/login?returnTo=<원경로+쿼리>` (12 §6.2 #1)
- ⚠️ 12 §2.1 위반 현황: 지원·MY **탭 터치**는 페이지 리다이렉트가 아니라 로그인 바텀시트여야 함 — 탭 클릭 단계에서 클라이언트가 시트를 띄우고, proxy 리다이렉트는 직접 URL 진입 시 폴백으로만 동작하도록 조정 (Phase 3-3).

## returnTo 규약 (12 §6)
- 같은 오리진의 경로만 허용(오픈 리다이렉트 방지), 폴백: 로그인 → `/home`, 프로필 저장 → `/my`, 온보딩 → `/home`
- `apply=1` 쿼리가 붙어 돌아오면 상세 페이지가 지원 시트를 자동 재오픈 (ApplyButton에 로직 준비됨)

## 응답 규약
- 성공 `{ success: true, ... }` / 실패 `{ error: string, code?: string }`
- 사용자 노출 메시지는 한국어 존댓말, 원인 노출 최소화. 서버 로그에만 상세.

## 작업 지시 예시
```
CLAUDE.backend.md를 참조해서:
1. /api/bookmarks (POST 토글, GET 목록 with audition join)를 009 스키마 기준으로 만들어줘
2. /api/apply에서 메일 발송 실패 시 applications에 status:'failed'로 기록하도록 바꿔줘 (11 F6)
```
