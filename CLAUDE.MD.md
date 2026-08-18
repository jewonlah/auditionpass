# 오디션패스 (AuditionPass) — 총괄 PM 에이전트

> **문서 상태**: 2026-08-18 전면 재작성 (리뉴얼 정본 기준). 이전 버전의 결제·광고·지원 횟수 제한 개념은 **전부 폐지**됨 — 아래 §"폐지 개념" 참조.
> **정본 우선순위**: `docs/renewal/00_decision-brief.md`(D1~D8) > `12_ia-userflows.md` > `11_prd.md` > `10_service-plan-v2.md`. 실행 계획은 `30_overhaul-masterplan.md`. 이 문서와 정본이 충돌하면 정본이 이긴다.

## 프로젝트 개요
한국 배우/모델 등 14개 분야 오디션 공고를 10+ 소스에서 자동 수집하고, 프로필 기반 **원클릭 지원**(지원 메일 자동 발송)을 제공하는 모바일 앱형 웹서비스. 라이브: https://auditionpass.co.kr

**포지셔닝(D1)**: 기능이 아니라 ① 커버리지(크로스사이트 수집 + SEO) ② 신뢰(검증 배지·출처 투명성) ③ 전달물 품질(컴프카드 PDF — R2)로 차별화. 톤은 "믿음직한 선배".

## 기술 스택 (실측 2026-08)
- **프론트/백엔드**: Next.js 16.2 (App Router, `proxy.ts` = 구 middleware) + React 19 + Tailwind CSS v4 + next-pwa
- **DB/Auth/Storage**: Supabase (RLS, pg_cron, Storage `profiles` 버킷)
- **메일**: Resend + @react-email
- **크롤러**: Python (requests/BeautifulSoup + Playwright 일부), GitHub Actions cron
- **배포**: Vercel (frontend, git 연동 추정 — **main 푸시 = 즉시 배포**) + GitHub Actions (crawler)
- **AI 분류**: Claude API (`crawler/classifier.py` — 현재 dead code, Phase 2-1에서 연결)

## 저장소 구조
```
auditionpass/
├── CLAUDE.MD.md          # 총괄 (이 파일)
├── CLAUDE.frontend.md    # 프론트 에이전트 — 라우트·컴포넌트·디자인 규칙
├── CLAUDE.backend.md     # API Routes 에이전트 — 지원/프로필/커뮤니티 API
├── CLAUDE.database.md    # DB 에이전트 — 스키마·마이그레이션(001~009)·RLS
├── CLAUDE.email.md       # 메일 에이전트 — Resend 지원 메일
├── CLAUDE.crawler.md     # 크롤러 에이전트
├── CLAUDE.ops.md         # 운영(승인 권한) / CLAUDE.marketing.md / CLAUDE.design.md
├── docs/renewal/         # 리뉴얼 정본 (00~30, 90)
├── frontend/             # Next.js 앱 (src/app, components, lib, types)
├── crawler/              # Python 크롤러 (scrapers/, sns/, classifier.py)
└── database/migrations/  # 001_initial ~ 009_renewal_apply_flow
```

## 리뉴얼 핵심 결정 요약 (D1~D8)
| 결정 | 내용 |
|---|---|
| D2 수익모델 | **지원 횟수 제한 폐지, 광고 폐지, `/pricing` 제거**. 과금은 R3에서 부스트·알림·프리미엄 템플릿·열람 확인으로 신규 설계 |
| D3 양면시장 | 지원 메일에 "지원자 보드"(`/board/[token]`) 링크 — R2 |
| D4 크롤링 | 신규 소스는 플레이DB·기획사 공식 페이지 2개만. **인스타 크롤링 금지**. `apply_email` 보유율 상시 지표 |
| D5 IA | **5탭**(홈 `/home` · 탐색 `/auditions` · 지원 `/applications` · 커뮤니티 `/community` · MY `/my`), returnTo 전면, 게이트는 바텀시트, 온보딩 3스텝 |
| D6 디자인 | 「콜시트」 — 랜딩 에디토리얼 + 앱 네이티브 유틸리티. 그라데이션·글로우·이모지 아이콘 금지. 상세는 `20_design-language.md`·`23_design-system.md` |
| D7 SEO | sitemap 갱신(미배포가 원인), 공개 4페이지 SSR, 카테고리 SEO 랜딩 14개 |
| D8 범위 밖 | 토스 결제 실연동, 카카오/네이버 로그인, CD 풀 대시보드, 네이티브 앱. 소셜 로그인은 **구글 OAuth만** |

## 사용자 확정 원칙 (2026-07-15)
1. **원클릭 지원이 핵심 기능** — `/home` 최상단에 항상 고정 노출.
2. **앱 UI는 네이티브 앱 감각 필수** — 푸터·브레드크럼·호버 의존·14px 이하 본문 금지. iOS 유틸리티 앱처럼.

## 폐지 개념 (에이전트가 절대 생성하지 말 것)
- `daily_apply_count` 테이블, `can_apply_today` / `increment_apply_count` / `get_daily_apply_status` 함수, `/api/apply/limit`, `useApplyLimit` — 009에서 DROP
- `/api/apply/ad-bonus`, Google AdSense, "광고 시청 → 추가 지원권"
- 토스페이먼츠 결제 플로우, `/api/payment/*`, `/pricing` 페이지, `subscriptions` 실사용 (테이블·타입은 호환용 잔존, 신규 로직 금지)
- `profiles.age` 필수 (→ `birth_year` 정본, `age`는 deprecated 폴백)
- `alert()` / `confirm()` (→ Toast / ConfirmSheet), 스피너 (→ 스켈레톤), 프로필 게이트 리다이렉트 (→ 바텀시트)

## 현재 단계 (2026-08-18)
- 브랜치 `renewal/r1`(origin 푸시됨)에 R1.1 작업 전부 커밋. `origin/main`은 2026-04-08 상태 = 라이브.
- 진행 위치: **Phase 0 안전 확보** 중 (30 마스터플랜 §2). 남은 항목: 0-3 Supabase 009 적용 여부 확인(사용자), 0-5 SERVICE_ROLE_KEY 로테이션(사용자).
- 다음: Phase 1 라이브 정상화(핫픽스 배포) → Phase 2 데이터 트랙 ∥ Phase 3 R1.1 프론트 본선.

## 모델 운영 전략 (2026-08-10 확정)
| 역할 | 모델 |
|---|---|
| 마스터플랜·아키텍처 결정·Phase 검수·정본 관리 | Fable 5 |
| 구현 에이전트(frontend/crawler/DB), 컨텍스트 수집, 반복 루프 | Opus 5 |

## 에이전트 승인 체계
- 개발 에이전트(frontend·backend·crawler·database·email)는 자율 실행. 마케팅/디자인은 스킬 설치·외부 연동 시 운영(ops) 승인.
- **금지 행위**: `main` 직접 푸시, 009 미확인 상태의 배포, `.env` 값 출력, `crawler/.env` 커밋.

## 코딩 원칙
- TypeScript `any` 금지, 컴포넌트 단위 분리, 환경변수는 `.env.local` (하드코딩 금지)
- 에러는 사용자 친화 메시지 + `code` 필드(`INCOMPLETE_PROFILE`, `ALREADY_APPLIED` 등)
- 모바일 퍼스트, `max-w-md` 앱 셸. 디자인 토큰은 `23_design-system.md`의 CSS 변수만 사용 (hex 하드코딩 금지)
- 커밋: `feat:` `fix:` `refactor:` `chore:` `docs:` + 범위 `(frontend|crawler|db|email)`
- 정본 인용 주석 권장: `// 12_ia-userflows §6 returnTo`

## 환경 변수
```env
# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@auditionpass.co.kr
NEXT_PUBLIC_SITE_URL=https://auditionpass.co.kr

# crawler/.env (GitHub Actions secrets 동일 키)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

## CLI 도구 우선 (MCP 대체)
`gh`(GitHub), `curl`+`jq`(HTTP), `docker`, 이미지 작업은 CLI 기반. 사용법 모르면 `--help` 먼저.

## 작업 지시 방법
"CLAUDE.frontend.md를 참조해서 …" 식으로 도메인 문서를 지정. 큰 변경은 반드시 `docs/renewal` 정본 번호를 인용.
