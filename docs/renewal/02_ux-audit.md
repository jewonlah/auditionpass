# 오디션패스 UX 정밀 진단 (02. UX Audit)

> 작성일: 2026-07-15 · 대상: `frontend/src` (Next.js 14 App Router + Tailwind + PWA + Supabase)
> 목적: "사용하기 복잡하다" 피드백의 코드 레벨 원인 규명 + 모바일 앱 수준 리뉴얼을 위한 IA 초안
> 심각도: 🔴 치명(전환 직접 손실/데드엔드) · 🟡 중요(마찰·혼란) · 🟢 개선(폴리시)

---

## 1. 요약

"복잡하다"의 실체는 **화면이 많아서가 아니라, 여정이 끊기기 때문**이다. 핵심 원인 5가지:

1. **컨텍스트 상실 리다이렉트가 시스템 전체에 만연** — 프로필 저장 후 마케팅 랜딩으로 추방(`ProfileForm.tsx:163`), 로그인 후 무조건 `/auditions`행(돌아갈 곳 기억 안 함), 필터 초기화 시 랜딩으로 이탈하는 실제 버그(`auditions/page.tsx:39`). 유저는 계속 "내가 하려던 일"을 잃어버린다.
2. **첫 지원까지 최대 15단계** — 이메일 인증(앱 이탈) → 지원 클릭 시점에 프로필 게이트 발동 → 15개 필드 프로필 폼 → 저장하면 랜딩 페이지 → 오디션 재검색. 의도 최고점에서 여정이 두 번 리셋된다.
3. **탭 3개가 실제 기능 구조와 불일치** — 핵심 가치인 "지원 추적"이 MY 하위 2뎁스에 매몰. 상세 페이지에선 활성 탭이 사라지고, 로고는 앱 밖(마케팅 랜딩)으로 나가는 문이다.
4. **데드엔드 CTA** — 지원 한도 모달의 "구독하고 무제한 지원하기"가 빈 스텁 페이지(`pricing/page.tsx`)로, 알림 설정은 "준비 중" 화면으로 연결. 유저가 누른 버튼이 벽에 부딪힌다.
5. **일관성 없는 중복 구현** — 토스트 2종, 시간표시 함수 3벌, 카테고리 칩 3벌, 그림자 2체계, 배지 2체계. 화면마다 미묘하게 달라 "정돈 안 된" 인상을 만든다.

GROWTH_PLAN 2절에서 이미 파악된 4개(프로필 게이트 타이밍, 소셜 로그인 부재, 지원 이력 매몰, 온보딩 0)는 전부 재확인됐고, 위 1·4·5와 아래 저니 표의 신규 발견들이 추가 발굴분이다.

---

## 2. 전체 라우트 맵

```
src/app
├─ page.tsx                        "/"           마케팅 랜딩 (서버). 로그인 여부 무관하게 항상 노출 ⚠️
├─ layout.tsx                                    루트 메타 + PWA manifest, maximumScale:1 ⚠️
├─ opengraph-image.tsx                           루트 OG
├─ auth/callback/route.ts                        이메일 인증 콜백 → 성공 시 /auditions, 실패 시 /login
│
├─ (auth)/                                       ※ 그룹 layout 없음 — 각 페이지가 자체 풀스크린
│   ├─ login/page.tsx              /login        이메일+비번만. 성공 시 무조건 /auditions (returnTo 없음)
│   └─ signup/page.tsx             /signup       이메일 인증 필수(더블 옵트인) → "메일 확인" 화면
│
├─ (main)/layout.tsx                             max-w-md 모바일 셸: Header + BottomNav
│   ├─ auditions/page.tsx          /auditions    리스트(클라이언트). 검색+필터+무한스크롤
│   ├─ audition/[id]/              /audition/:id 상세(클라이언트) ※ 리스트와 단수/복수 불일치
│   │   ├─ layout.tsx                            generateMetadata + JSON-LD (서버)
│   │   └─ opengraph-image.tsx                   동적 OG
│   ├─ community/page.tsx          /community    리스트(클라이언트, 메타데이터 없음)
│   │   ├─ write/page.tsx          …/write       글쓰기 — 렌더 중 client 리다이렉트 게이트
│   │   └─ [id]/page.tsx           …/:id         상세(클라이언트) / [id]/edit — 수정
│   ├─ history/page.tsx            /history      지원 이력 🔒
│   ├─ profile/page.tsx            /profile      프로필 등록/수정 🔒
│   ├─ my/page.tsx                 /my           MY 허브 🔒
│   │   ├─ posts / notifications(준비중 스텁) / notice / faq / terms / privacy
│   └─ pricing/page.tsx            /pricing      🔴 빈 스텁 ("구독 플랜 선택 페이지입니다.")
│
└─ middleware.ts                                 🔒 = /profile, /history, /my 서버 게이트 → /login
                                                 (returnTo 파라미터 없음 → 로그인 후 원래 목적지 상실)
```

**인증 게이트 이중화**: 미들웨어(서버) + 각 페이지의 `useAuth` 후 `router.push("/login")`(클라이언트)가 중복. 커뮤니티 글쓰기·좋아요·댓글은 미들웨어 미보호 → 클라이언트에서만 게이트.

---

## 3. 유저 저니별 마찰 지점

### 저니 A — 신규 방문 → 가입 → 프로필 → 첫 지원 (최대 15단계)

`랜딩 → 가입폼 → 메일함 이동(앱 이탈) → 인증 클릭 → /auditions 착지(안내 0) → 카드 → 상세 → 지원 클릭 → 에러 토스트 → 프로필 폼(15필드) → 저장 → 마케팅 랜딩(!) → 앱 재진입 → 오디션 재검색 → 상세 → 지원`

| # | 마찰 지점 | 위치 | 심각도 | 상세 |
|---|---|---|---|---|
| A1 | 이메일 인증 강제(더블 옵트인) — 가입 중 앱을 떠나 메일함으로 | `signup/page.tsx:43-61` | 🔴 | 인증 전 로그인 시 "이메일 인증을 완료해주세요" 에러(`login/page.tsx:46-48`). 소셜 로그인 부재(기지)와 결합돼 가입 퍼널 최대 병목 |
| A2 | 인증 완료 착지 후 온보딩 0 — 프로필 필수인 걸 알 방법 없음 | `auth/callback/route.ts:35` | 🔴 | 맥락 없이 `/auditions` 리스트에 투하 (기지 항목 재확인) |
| A3 | 프로필 게이트가 의도 최고점에서 발동 — 에러 토스트 1.5초 후 강제 리다이렉트 | `ApplyButton.tsx:53-59` | 🔴 | (기지) 지원 버튼이 사실상 "에러 발생기". `setTimeout` 1.5초 동안 유저는 뭘 잘못했는지 불안 |
| A4 | 프로필 폼 = 단일 롱폼 15개 필드 + 사진 업로드, 스텝 분할·임시저장 없음 | `ProfileForm.tsx:168-489` | 🟡 | 지원에 필요한 최소치(이름·나이·성별·분야)와 선택 정보(SNS·경력·특기)가 동급으로 나열 → 정보 과잉 |
| A5 | "활동 분야"(배우/모델/가수)와 "장르 선택"(배우/모델)이 사실상 같은 질문 2번 — 둘 다 필수 | `ProfileForm.tsx:279-337` | 🟡 | 신규 유저가 차이를 이해할 수 없음. "복잡하다" 체감의 전형 |
| A6 | **프로필 저장 성공 → `router.push("/")` = 마케팅 랜딩으로 추방** | `ProfileForm.tsx:163` | 🔴 | 지원하려던 오디션 컨텍스트 완전 소실. 다시 로그인 상태로 랜딩의 "무료로 시작하기"를 보게 됨. 첫 지원 여정 최대 이탈 지점 |
| A7 | 첫 지원 성공 후 후속 행동 제안 없음 — 토스트 한 줄 뿐 | `ApplyButton.tsx:84-87` | 🟡 | "이력 보기 / 비슷한 오디션 더 보기" 등 다음 행동 부재 (기지 6번 유사) |
| A8 | 무료 1회/일 한도 → 한도 모달의 "구독" CTA가 **빈 페이지**로 | `ApplyButton.tsx:279`, `pricing/page.tsx:1-8` | 🔴 | 데드엔드. 광고 시청도 2초 가짜 시뮬레이션(`ApplyButton.tsx:118-120`) — 신뢰 훼손 |

### 저니 B — 재방문 → 탐색 → 지원

| # | 마찰 지점 | 위치 | 심각도 | 상세 |
|---|---|---|---|---|
| B1 | 로그인 상태로 `/` 방문해도 마케팅 랜딩 노출(앱 리다이렉트 없음) | `app/page.tsx:43` | 🔴 | PWA 아이콘/북마크로 재방문하는 유저가 매번 광고 페이지부터 봄 |
| B2 | 인앱 헤더 로고 클릭 → `/`(랜딩) = 앱에서 나가는 문 | `Header.tsx:23` | 🔴 | (기지 6번) 모바일 앱 관점에선 "홈 버튼이 앱을 종료"하는 것과 동일 |
| B3 | **필터/검색 초기화 시 `router.replace("/")` → 랜딩 페이지로 이동하는 버그** | `auditions/page.tsx:39` | 🔴 | 쿼리스트링이 비면 `"/"`로 replace. "전체" 필터로 되돌리거나 검색어를 지우면 리스트를 이탈. 신규 발견 실버그 |
| B4 | 리스트 상태 비보존 — 상세→뒤로가기 시 전체 리페치, 스크롤·페이지 위치 소실 | `auditions/page.tsx:97-100` | 🟡 | 무한스크롤 3페이지 내려간 뒤 상세 갔다 오면 처음부터. 탐색 반복 비용 급증 |
| B5 | 필터 축 혼합 — 지원방식(원클릭/사이트)과 장르(배우/모델)가 한 줄 칩에 공존, 단일 선택 | `AuditionFilter.tsx:5` | 🟡 | "배우 + 원클릭" 조합 불가. 백엔드는 14개 카테고리인데 UI는 2개 장르만 노출 |
| B6 | 카드가 100% 텍스트 — 포스터·지역·페이 없음 | `AuditionCard.tsx` | 🟡 | (기지, 데이터 모델 이슈) 탐색 화면의 시각적 스캔 불가 |
| B7 | 북마크/찜 없음 → "나중에 지원" 동선 부재 | 전역 | 🟡 | (기지) 재방문 리텐션 고리 없음 |
| B8 | 지원 이력 진입 = MY 탭 → "지원 이력" 메뉴, 2뎁스 | `my/page.tsx:86-90` | 🟡 | (기지) 핵심 가치(추적)가 설정 메뉴 사이에 매몰 |
| B9 | 마감 상세의 원문 링크·D-day만 있고 "비슷한 오디션" 추천 0 — 마감 공고가 데드엔드 | `audition/[id]/page.tsx:253-256` | 🟢 | 회유 동선 없음 |

### 저니 C — 커뮤니티 이용

| # | 마찰 지점 | 위치 | 심각도 | 상세 |
|---|---|---|---|---|
| C1 | 비로그인 좋아요/댓글 → 조용히 `/login`으로 push, 읽던 글 컨텍스트 소실 + 로그인 후 `/auditions`행 | `community/[id]/page.tsx:88-91,109-112` + `login/page.tsx:54` | 🔴 | returnTo 부재로 "글 → 로그인 → 오디션 리스트"라는 예상 밖 순간이동. 전 서비스 공통 결함 |
| C2 | 비로그인 답글 버튼은 `if (!isLoggedIn) return;` — 눌러도 아무 일 없는 죽은 버튼 | `community/[id]/page.tsx:437` | 🟡 | 무반응 UI. 로그인 유도조차 안 함 |
| C3 | 글쓰기 게이트가 렌더 본문 중 `router.push("/login")` — 화면 깜빡 후 이동 | `community/write/page.tsx:35-38` | 🟡 | 미들웨어 미보호 경로. 작성 의도(카테고리/제목) 소실 |
| C4 | 글 작성 중 이탈 방지·임시저장 없음, 뒤로가기 즉시 소실 | `community/write/page.tsx:83-89` | 🟡 | 5000자 본문이 confirm 없이 증발 가능 |
| C5 | 본인 글 상세 메뉴에 "삭제"만 있고 "수정" 없음 — 수정은 `/my/posts`에서만 도달 가능 | `community/[id]/page.tsx:211-221` | 🟡 | `[id]/edit` 라우트가 존재하는데 상세에서 진입 불가. IA 단절 |
| C6 | 고정 댓글바(bottom-14)와 BottomNav(bottom-0)가 겹겹이 적층 — 작은 화면에서 본문 가시 영역 압박 | `community/[id]/page.tsx:342` | 🟢 | 상세의 지원 바(bottom-16)도 동일 패턴. 하단 고정 레이어 규칙 부재 |
| C7 | 커뮤니티 필터 상태 URL 미반영(오디션 리스트와 달리) — 공유·뒤로가기 시 "전체"로 리셋 | `community/page.tsx:53-54` | 🟢 | 같은 앱 안에서 필터 URL 정책이 화면마다 다름 |

---

## 4. 내비게이션 / IA 진단

### BottomNav (`components/layout/BottomNav.tsx`)
- **탭 3개(홈/커뮤니티/MY)** — 모바일 앱 표준(4~5탭) 대비 부족하고, 핵심 기능 "지원 추적"과 "탐색 필터"에 1탭 진입이 없음.
- **활성 판정이 `pathname === href` 완전일치**(`BottomNav.tsx:21`) → `/audition/[id]`, `/profile`, `/history`, `/my/posts` 등 대부분의 화면에서 **활성 탭이 없음**. 유저가 "내가 어느 섹션에 있는지" 상시 상실.
- 라벨 "홈"의 href는 `/auditions`인데 헤더 로고는 `/` — **홈이 2개**.
- 세이프 에어리어(`env(safe-area-inset-bottom)`) 미적용 → iOS PWA에서 홈 인디케이터와 겹침.
- 비로그인 상태에서도 MY 탭 노출 → 탭 누르면 미들웨어가 `/login`으로 튕김(예상 밖 리다이렉트).

### Header (`components/layout/Header.tsx`)
- 전 화면 공통으로 "로고 + 로그아웃"만 표시. **페이지 타이틀·뒤로가기·검색·알림 등 앱 헤더의 기본 요소 부재.**
- 대신 각 상세 페이지가 본문 안에 자체 뒤로가기 버튼을 구현(`audition/[id]/page.tsx:157`, `community/[id]/page.tsx:196`, `community/write/page.tsx:83`) — 위치·스타일 제각각.
- 로그아웃이 헤더에 상시 노출 — 가장 안 쓰는 액션이 가장 좋은 자리를 점유. MY에도 중복 존재(`my/page.tsx:191`).

### 구조적 문제
- **라우트 명명 불일치**: 리스트 `/auditions` vs 상세 `/audition/[id]`.
- **returnTo/redirect 파라미터가 시스템 어디에도 없음** — 모든 게이트(미들웨어·클라이언트)가 로그인 후 목적지를 버림. "복잡하다"의 최상위 원인.
- `viewport.maximumScale: 1`(`app/layout.tsx:48`) — 핀치줌 차단, 접근성 위반.
- 상태 유지 부재: 클라이언트 페치 + 캐시 없음 → 탭 전환·뒤로가기마다 스피너. 네이티브 앱과의 체감 격차 핵심.
- 스텁 화면 2개(`/pricing`, `/my/notifications`)가 실 CTA로 연결됨.

---

## 5. 컴포넌트 인벤토리 & 일관성 문제

### 재사용 컴포넌트 (13개)
| 분류 | 컴포넌트 | 비고 |
|---|---|---|
| ui | `Button`(4 variant × 3 size), `Input`, `Badge`(4 variant), `Modal`(native dialog) | 기반은 건전 |
| audition | `AuditionCard`, `AuditionFilter`, `ApplyButton`(+내장 ResultToast), `DescriptionRenderer` | |
| layout | `Header`, `BottomNav` | |
| profile | `ProfileForm`, `PhotoUpload` | |

### 중복·불일치 (같은 목적, 다른 구현)
| 문제 | 위치 | 심각도 |
|---|---|---|
| **토스트 2종**: ApplyButton 내장 ResultToast(top-4, 컬러 배경) vs 커뮤니티 공유 토스트(top-20, 다크) — 공용 토스트 시스템 없음 | `ApplyButton.tsx:316-349`, `community/[id]/page.tsx:307-312` | 🟡 |
| **`timeAgo()` 3중 복붙** | `community/page.tsx:38`, `community/[id]/page.tsx:32`, `my/posts/page.tsx:29` | 🟡 |
| **`CATEGORY_COLORS` 3중 복붙** | 위와 동일 3개 파일 | 🟡 |
| **필터 칩 3벌**: AuditionFilter(text-sm) vs 커뮤니티 카테고리 칩(text-xs) vs 글쓰기 카테고리 칩 — 동일 패턴, 크기·여백 상이 | `AuditionFilter.tsx`, `community/page.tsx:185-200`, `community/write/page.tsx:114-129` | 🟡 |
| **엘리베이션 2체계**: `shadow-sm`(AuditionCard, history) vs 커스텀 `shadow-[0_1px_4px…indigo]`(상세·MY·커뮤니티) | `AuditionCard.tsx:18` vs `audition/[id]/page.tsx:166` 등 | 🟡 |
| **장르 배지 2체계**: 카드에선 `Badge` 컴포넌트, 상세에선 자체 `GENRE_COLORS` span — 같은 데이터 다른 모양 | `AuditionCard.tsx:30` vs `audition/[id]/page.tsx:48-52,169-172` | 🟡 |
| **버튼 이원화**: `Button` 컴포넌트 vs 생 스타일 button/Link(커뮤니티 글쓰기·등록, 랜딩 CTA 등) | `community/page.tsx:145-151`, `community/write/page.tsx:90-100` | 🟢 |
| **로딩 = 동일 Loader2 블록 8곳 복붙**, 스켈레톤 없음 → 화면 전환마다 백지+스피너 | 전 페이지 공통 | 🟡 |
| **네이티브 `alert()`/`confirm()` 사용** — Modal 컴포넌트 보유하고도 미사용 | `PhotoUpload.tsx:40,43`, `community/[id]/page.tsx:156`, `my/posts/page.tsx:66` | 🟢 |
| **데드 코드**: `hooks/useProfile.ts`, `hooks/useApplyLimit.ts`, `lib/dummy-data.ts` — 어디서도 import 안 됨 | `src/hooks`, `src/lib` | 🟢 |
| 랜딩 페이지는 하드코딩 hex(`#6366F1`)·자체 스타일, 앱 내부는 `primary` 토큰 — 브랜드 표기도 "AUDITIONPASS" vs "오디션패스" 혼용 | `app/page.tsx` vs `(main)` 전역 | 🟢 |

---

## 6. 신규 IA 제안 초안 (모바일 앱형)

### 6.1 탭 구조: 3탭 → 5탭

```
[홈]        [탐색]       [지원]        [커뮤니티]    [MY]
/home       /auditions   /applications /community   /my
개인화 피드   전체 리스트    이력+상태 추적   현행 유지     프로필·설정
```

- **홈(신설)**: 로그인 후 착지점. ① 프로필 완성도 카드(게이트를 배너로 전환) ② 마감 임박 TOP ③ 내 분야 신규 공고 ④ 지원 현황 요약("지원 3건 · 오늘 1회 남음"). 헤더 로고도 로그인 시 여기로.
- **탐색**: 현 `/auditions`. 필터 2축 분리(카테고리 칩 + 지원방식/지역/페이는 바텀시트 필터), 상태·스크롤 보존(React Query 캐시 or 서버 컴포넌트 + `<Link>` 프리페치).
- **지원(신설)**: `/history` 승격 + 상태 단계(발송→열람→회신) + 찜 탭 동거. 핵심 가치의 1탭 진입.
- **MY**: 프로필·알림·약관·로그아웃만 남김("내가 쓴 글"은 커뮤니티 탭 내 프로필 영역으로 이동 검토).
- 탭 활성 판정은 `pathname.startsWith(section)`으로, 상세 페이지에서도 섹션 유지. 세이프 에어리어 패딩 추가.

### 6.2 온보딩 플로우 (프로필 게이트 재배치)

```
가입(구글 OAuth 우선, 이메일은 보조)
 → 미니 온보딩 3스텝 바텀시트 (스킵 가능)
    Step1: 이름·나이·성별          ← 지원 최소 요건
    Step2: 활동 분야(장르와 통합, 단일 질문)
    Step3: 사진 1장 (나중에 하기 허용)
 → /home 착지 (프로필 완성도 카드 노출)
```

- **지원 시점 게이트는 "에러+리다이렉트" → "인라인 바텀시트"로**: 프로필 미완성 상태에서 지원 버튼을 누르면 상세 페이지 위에 부족한 필드만 채우는 시트가 뜨고, 완료 즉시 그 자리에서 지원 진행. 페이지 이탈 0.
- 프로필 폼 자체도 2섹션으로 재편: "지원 필수(이름·나이·성별·분야·사진)" / "포트폴리오 강화(SNS·경력·특기·소속사)" — 필수만 채우면 저장 가능. "활동 분야 vs 장르" 이중 질문 통합.
- 저장 후 이동: **항상 직전 컨텍스트로 복귀**(`returnTo` 쿼리 파라미터를 로그인·프로필·글쓰기 게이트 전체에 도입).

### 6.3 즉시 수정 (리뉴얼 전이라도)

1. `ProfileForm.tsx:163` — `router.push("/")` → `returnTo` 복귀 (1줄 수정으로 A6 제거)
2. `auditions/page.tsx:39` — `router.replace("/")` → `"/auditions"` (B3 버그)
3. `Header.tsx:23` — 로그인 시 로고 href `/auditions` (B2)
4. `middleware.ts` + `login/page.tsx:54` — `?returnTo=` 저장·복귀 (C1·전역)
5. `ApplyButton.tsx:279` — 결제 미오픈 동안 `/pricing` CTA 숨김 (A8 데드엔드)
6. `BottomNav.tsx:21` — `startsWith` 활성 판정 + safe-area
7. `app/page.tsx` — 로그인 세션 감지 시 `/auditions`(→추후 `/home`) 리다이렉트 (B1)

### 6.4 리뉴얼 시 공통 시스템

- **디자인 토큰 통일**: 엘리베이션 1체계, Badge/칩/토스트 공용 컴포넌트화, `timeAgo`·`CATEGORY_COLORS` lib 이동.
- **스켈레톤 로딩** 표준화(리스트·상세·MY), 낙관적 업데이트(좋아요·댓글).
- **하단 고정 레이어 규칙**: BottomNav 위 1레이어만 허용(지원 바/댓글 바), 겹침 금지.
- 접근성: `maximumScale:1` 제거, 죽은 버튼(C2) 제거, native confirm → Modal.

---

*근거 파일은 각 표의 `파일:라인` 참조. 다음 단계: 이 진단 기반 03_와이어프레임/플로우 설계.*
