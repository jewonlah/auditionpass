# 프론트엔드 에이전트 — Next.js 16 + React 19 + Tailwind v4 + PWA

> 2026-08-18 재작성. 디자인 정본: `docs/renewal/20_design-language.md`(규칙) · `23_design-system.md`(토큰·컴포넌트) · `22_app-prototype.html`(앱 시안) · `21_landing.html`(랜딩 시안). IA 정본: `12_ia-userflows.md`. 수용 기준: `11_prd.md` F1~F12.
> 이전 문서의 `/pricing`·`/history`·광고 모달·`useApplyLimit`·토스 SDK는 **폐지**.

## 역할
`frontend/` Next.js App Router 앱. **모바일 네이티브 앱 감각의 5탭 셸**(D5)을 구현·유지한다. "웹사이트 같다"는 피드백이 리뉴얼의 출발점 — 표현층 규칙(§디자인 규칙)이 기능만큼 중요하다.

## 라우트 (실측 + 예정)
```
/                      랜딩(비로그인) — 로그인 시 /home 리다이렉트
/(auth)/login, signup  ?returnTo= 지원, 구글 OAuth 버튼(Supabase provider 설정 후 활성)
/(main)/home           앱 홈 🔒 — 최상단 원클릭 오디션 섹션 고정(사용자 확정), 완성도 카드, 마감 임박, 내 분야 신규
/(main)/auditions      탐색 — 카테고리 칩 + 필터 시트, 무한스크롤, (SSR 전환 예정 F7)
/(main)/auditions/[category] ×14   SEO 랜딩 🔜 (2-1 분류 데이터 후 오픈)
/(main)/audition/[id]  상세 — 하단 지원 바 → 게이트 바텀시트 ⓐⓑⓒ, 마감 시 비슷한 오디션 3건
/(main)/applications   지원 탭 🔒 — 세그먼트: 지원함 / 찜(F6 🔜)
/(main)/community, [id], write, [id]/edit
/(main)/my 🔒, my/posts, my/faq, my/notice, my/terms, my/privacy, my/notifications(→ /my 301 예정)
/(main)/profile 🔒     2섹션 폼(지원 필수 / 포트폴리오), ?returnTo= 복귀
/onboarding 🔜         3스텝(분야 → 미니 프로필 → 첫 추천), 스킵 가능
/auth/callback         OAuth·이메일 공용
sitemap.ts, robots.ts  (/home /onboarding /login /signup 차단)
```
🔒 = `src/proxy.ts` 보호. `/history`→`/applications`, `/pricing`→`/` 301 리다이렉트는 `next.config` redirects에 유지.

## 폴더 구조 (실측)
```
src/
├── app/            (auth)/ (main)/ api/ auth/callback  layout.tsx page.tsx sitemap.ts robots.ts
├── proxy.ts        인증 게이트 + returnTo 부착 (Next 16 middleware)
├── components/
│   ├── ui/         Button Input Badge Modal BottomSheet  (+ 예정: Toast ConfirmSheet BackButton Skeleton SegmentedControl)
│   ├── audition/   AuditionCard AuditionFilter DescriptionRenderer ApplyButton(게이트 상태머신)
│   ├── profile/    ProfileForm PhotoUpload
│   └── layout/     BottomNav(5탭) Header
├── lib/            supabase/{client,server}.ts  email/  profile.ts(getMissingFields·PROFILE_GENRES)  utils.ts  og/font.ts
├── hooks/          useAuth.ts
└── types/index.ts  Profile(birth_year) Audition Application(status) Bookmark CommunityPost…
```

## 핵심 컴포넌트 계약
- **ApplyButton** — 상태머신: `idle → checking(/api/apply/check) → sheet-a(비로그인) | sheet-b(missingFields 인라인 입력) | sheet-c(프로필 요약 확인) → sending → done | error`. 서버 `code`(`INCOMPLETE_PROFILE`·`ALREADY_APPLIED`)로 분기. `?apply=1` 복귀 시 자동 재오픈. **페이지 리다이렉트로 게이트 처리 금지**.
- **BottomNav** — 5탭 `House /home` · `Search /auditions` · `Send /applications` · `MessagesSquare /community` · `CircleUser /my`. 비로그인: 홈 탭은 `/`로, 지원·MY 탭은 **로그인 바텀시트**(페이지 이동 금지 — 12 §2.1).
- **Header** — 루트형(로고+액션) / 상세형(chevron 뒤로가기, `router.back()` 폴백 탭 루트) / 태스크형(X + 완료). 공용 BackButton으로 통합(현재 4벌 중복 → 정리 대상).
- **BottomSheet** — grabber 36×5px, 상단 radius 20px, transform 스프링 `cubic-bezier(0.32,0.72,0,1)` 400ms, 딤 250ms.
- **returnTo** — 같은 오리진 경로만, 폴백 `/home`·`/my`. 세팅 지점 8곳은 12 §6.2.

## 디자인 규칙 (위반 = 리뷰 반려)
- **토큰만 사용**: `23_design-system.md`의 CSS 변수(`--color-ink`, `--color-primary #4F46E5` 등)를 `globals.css`에 정의하고 Tailwind 테마로 참조. hex 하드코딩 금지(현재 59곳 치환 대상).
- **금지**: 그라데이션, 컬러 글로우 섀도우, 이모지 아이콘(lucide/인라인 SVG만), 보라→핑크, 균일 카드 3열, 센터 히어로 풀세트, 가짜 통계, `alert/confirm`, 스피너, 푸터·브레드크럼, `hover:` 의존(→ `active:scale-[0.98]`), 링크 밑줄·파란 링크색.
- **타이포**: Pretendard Variable **self-host/next-font**(CDN @import 금지). 앱 화면 타이틀 28~34px/700, 리스트 타이틀 16~17px/600, **본문 최소 15px**, 메타 13px, 유틸 라벨 11px 모노 대문자. 숫자 `tabular-nums`.
- **레이아웃**: 앱은 row+inset divider 리스트, 화면당 주요 CTA 1개, 터치 타깃 44px+, safe-area 대응, `max-w-md mx-auto` 셸. radius 컨트롤 8 / 시트 20 / 배지 pill. 섀도우 `0 1px 2px rgba(20,20,20,.04), 0 8px 24px rgba(20,20,20,.08)`만.
- **배지**: 원클릭(success #10B981 pill) · 사이트지원(gray) · 장르(gray100/700) · D-day 텍스트(D-7 warning, D-3 danger).
- **모션**: fast 150 / base 250 / slow 400ms, `cubic-bezier(0.22,1,0.36,1)`; 리스트 스태거 30~40ms; 프레스 scale(0.98) 100ms; **`prefers-reduced-motion` 시 전부 무효**. 로딩은 스켈레톤(shimmer 1.2s).
- **카피**: 존댓말·과장 금지, "믿음직한 선배". 숫자는 실데이터만. CTA 맥락별.

## 데이터 접근
- 서버 컴포넌트/route: `createServerClient()` (`@/lib/supabase/server`), 클라: `createClient()`.
- 공개 4페이지(탐색·상세·커뮤니티 목록·상세)는 **SSR + generateMetadata + JSON-LD(JobPosting/Article)** 로 전환(F7+F9 단일 작업). 스크롤 위치 보존.
- 프로필 검증은 `@/lib/profile getMissingFields` 단일 소스. 카테고리 문자열은 `PROFILE_GENRES`.

## PWA
`next-pwa` (dev 비활성, `public/sw.js` gitignore). `maximumScale:1` 메타 제거(D7).

## Phase 3 실행 순서 (30 §2)
F12 토큰·UI킷 → 타이포/터치 일괄 → F2 비로그인 탭 게이트 → F4 온보딩+구글 OAuth → F6 찜·지원 탭 → F7+F9 SSR·SEO → SEO 랜딩 14 → F1 랜딩 → F8 모션 → F11 정리(미사용 의존성: toss SDK 제거, RHF+zod는 폼 리팩터 활용 여부 결정).

## 작업 지시 예시
```
CLAUDE.frontend.md를 참조해서:
1. 23_design-system.md 토큰을 globals.css에 이식하고 hex 하드코딩을 전부 치환해줘 (F12)
2. BottomNav 비로그인 지원·MY 탭 터치를 로그인 바텀시트로 바꿔줘 (12 §2.1)
```
