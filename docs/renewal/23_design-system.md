# 오디션패스 디자인 시스템 — 개발 핸드오프 (23. Design System)

> 작성일: 2026-07-15 · 기준 문서: `20_design-language.md`(절대 기준) + `02_ux-audit.md` §5(통합 대상)
> 대상 스택: **Next.js 16 (App Router) + Tailwind CSS v4 + React 19**
> ⚠️ 현재 프로젝트는 Tailwind v4 CSS-first 구성이다. `tailwind.config.*` 파일이 존재하지 않으며,
> 토큰은 `globals.css`의 `@theme`으로 정의한다(아래 코드가 곧 config다).

---

## 1. 토큰 → Tailwind 매핑

### 1.1 globals.css 전체 교체본

기존 `globals.css`의 CDN `@import`(1행)와 구 토큰(`#6366F1`, `#F8FAFC` 등)은 **전부 폐기**한다.

```css
/* src/app/globals.css */
@import "tailwindcss";

/* ── 시맨틱 CSS 변수 (라이트 = 기본값) ─────────────────────── */
:root {
  /* 컬러 (20 문서 §컬러 토큰) */
  --color-paper: #FAFAF7;        /* 랜딩 배경 (웜 오프화이트) */
  --color-surface: #FFFFFF;      /* 앱 배경, 카드 */
  --color-ink: #141414;          /* 헤드라인, 본문 강조 */
  --color-ink-70: #4A4A48;       /* 본문 */
  --color-ink-40: #8A8A86;       /* 보조, 캡션, 모노 라벨 */
  --color-line: #E7E5E0;         /* 헤어라인 (랜딩) */
  --color-line-app: #F0F0EE;     /* 헤어라인 (앱) */
  --color-primary: #4F46E5;      /* 주요 액션 — 화면당 1~2회 절제 */
  --color-primary-ink: #3730A3;  /* 프라이머리 텍스트 온 라이트 */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-danger: #EF4444;
  --color-ink-inverse: #FAFAF7;
  --color-dark: #161615;         /* 다크 섹션 배경 (순수 검정 금지) */

  /* 섀도우 — 레이어드 뉴트럴만, 컬러 섀도우 금지 */
  --shadow-raised: 0 1px 2px rgba(20,20,20,.04), 0 8px 24px rgba(20,20,20,.08);
  --shadow-overlay: 0 -4px 16px rgba(20,20,20,.06), 0 -24px 48px rgba(20,20,20,.10);

  /* radius */
  --radius-control: 8px;   /* 버튼·인풋·칩 */
  --radius-sheet: 20px;    /* 시트·모달 상단 */

  /* 모션 */
  --dur-fast: 150ms;
  --dur-base: 250ms;
  --dur-slow: 400ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);   /* 기본 (ease-out-quart계) */
  --ease-sheet: cubic-bezier(0.32, 0.72, 0, 1); /* 바텀시트 스프링 느낌 */
}

/* 다크모드 — 값은 v2 스코프 밖. 구조만 예약해 두고 셀렉터를 비워두지 않는다(빌드 안전). */
[data-theme="dark"] {
  /* TODO(v3): --color-paper / --color-surface / --color-ink … 재정의.
     컴포넌트는 전부 시맨틱 변수만 참조하므로 이 블록 채우는 것으로 전환 완료. */
  color-scheme: dark;
}

/* ── Tailwind v4 테마 매핑 (bg-paper, text-ink-40, shadow-raised …) ── */
@theme inline {
  --color-paper: var(--color-paper);
  --color-surface: var(--color-surface);
  --color-ink: var(--color-ink);
  --color-ink-70: var(--color-ink-70);
  --color-ink-40: var(--color-ink-40);
  --color-line: var(--color-line);
  --color-line-app: var(--color-line-app);
  --color-primary: var(--color-primary);
  --color-primary-ink: var(--color-primary-ink);
  --color-success: var(--color-success);
  --color-warning: var(--color-warning);
  --color-danger: var(--color-danger);
  --color-ink-inverse: var(--color-ink-inverse);
  --color-dark: var(--color-dark);

  --shadow-raised: var(--shadow-raised);
  --shadow-overlay: var(--shadow-overlay);

  --radius-control: var(--radius-control);
  --radius-sheet: var(--radius-sheet);

  --font-sans: var(--font-pretendard), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --ease-out: var(--ease-out);
  --ease-sheet: var(--ease-sheet);
}

body {
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-sans);
}

/* 유틸리티 라벨 (콜시트 "SCENE/TAKE" 모노 라벨) — 반복 사용이라 유틸로 승격 */
@utility label-mono {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-ink-40);
}

/* D-day·카운트 숫자 */
@utility tabular { font-variant-numeric: tabular-nums; }
```

### 1.2 Pretendard self-host (CDN @import 제거)

`@import url('https://cdn.jsdelivr.net/...')`은 렌더 블로킹 + 외부 의존이므로 삭제하고 `next/font/local`로 교체한다.

```bash
npm i pretendard   # 가변 폰트 woff2 포함
```

```tsx
// src/app/layout.tsx
import localFont from "next/font/local";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export default function RootLayout({ children }) {
  return <html lang="ko" className={pretendard.variable}><body>{children}</body></html>;
}
```

- `--font-pretendard` 변수가 §1.1의 `--font-sans`로 연결된다.
- npm 의존이 싫으면 `public/fonts/`가 아닌 `src/fonts/PretendardVariable.woff2`에 두고 같은 방식으로 로드(next/font는 자체 최적화·preload 처리).

### 1.3 타이포 스케일 (클래스 레시피)

| 용도 | 레시피 |
|---|---|
| 랜딩 히어로 | `text-[clamp(40px,7vw,76px)] font-extrabold tracking-[-0.03em] leading-[1.05]` |
| 랜딩 섹션 타이틀 | `text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.02em]` |
| 랜딩 본문 | `text-[17px] leading-[1.7] text-ink-70` |
| 앱 페이지 타이틀 | `text-[22px] font-bold text-ink` |
| 리스트 타이틀 | `text-[16px] font-semibold text-ink` |
| 앱 본문 | `text-[15px] text-ink-70` |
| 메타 | `text-[13px] text-ink-40` |
| 유틸리티 라벨 | `label-mono` (§1.1 유틸) |
| D-day/숫자 | `tabular` 병기 |

---

## 2. 컴포넌트 스펙

공통 원칙: 인라인 SVG 스트로크 아이콘만(이모지 금지) · 그라데이션/컬러 글로우 금지 · radius는 컨트롤 8px, 시트 20px, 배지 pill 외 사용 금지 · 터치 타겟 최소 44×44px.

### 2.1 Button — `components/ui/Button.tsx` 개편

기존 4 variant(`primary/accent/outline/ghost`) → **`primary/secondary/ghost/danger`**. `accent` 폐기(주황 버튼은 브랜드 외), `outline`→`secondary`.

- **해부도**: 컨테이너(rounded-control) + 라벨(semibold) + 선행 아이콘(선택, 16~18px) + 로딩 시 라벨을 스켈레톤 점멸이 아닌 **라벨 유지 + 인라인 스피너 대체 금지 → 라벨 옆 3점 도트 or 라벨 치환("지원 중…")**. 스피너 금지 원칙은 화면 로딩에 한하므로 버튼 내 14px 미니 인디케이터는 허용하되, 폭 점프 방지 위해 `min-w` 고정.
- **프레스 피드백**: `active:scale-[0.98]` + `transition-transform duration-100`.

```tsx
const base =
  "inline-flex items-center justify-center rounded-[--radius-control] font-semibold " +
  "transition-[background-color,transform] duration-150 ease-[--ease-out] " +
  "active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const variants = {
  primary:   "bg-primary text-white hover:bg-primary-ink",
  secondary: "border border-line text-ink bg-surface hover:bg-paper",
  ghost:     "text-ink-70 hover:bg-black/[.04]",
  danger:    "bg-danger text-white hover:brightness-95",
};
const sizes = {
  sm: "h-9 px-3 text-[13px]",          // 인라인 액션 전용(터치 주요 동선 금지)
  md: "h-11 px-4 text-[15px]",         // 기본 (44px 터치 타겟)
  lg: "h-[52px] px-6 text-[16px] w-full", // 하단 고정 CTA
};
```

- **상태**: default / hover / active(scale) / focus-visible(2px 링) / disabled(opacity-40) / loading(`aria-busy` + 클릭 차단).
- **대체 대상**: `Button.tsx` 자체 개편 + 커뮤니티 글쓰기·등록의 생 스타일 button(`community/page.tsx:145`, `community/write/page.tsx:90`), 랜딩 CTA 전부 이 컴포넌트로 수렴. `focus:ring-offset-2` 체계 폐기(→ outline 방식).

### 2.2 Badge — 브랜드 규칙 4종 고정

기존 `default/danger/success/warning` 4 variant를 **의미 기반**으로 교체. 형태는 pill 유지.

```tsx
const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";
const variants = {
  oneclick: "bg-success text-white",        // 원클릭 지원
  site:     "bg-ink-40 text-white",         // 사이트 지원
  genre:    "bg-black/[.06] text-ink-70",   // 장르/카테고리 (gray100/gray700 상당)
};
// D-day는 Badge가 아니라 "텍스트"다:
// <span className="tabular text-[13px] font-semibold {색}">D-3</span>
//   기본 text-ink-40 · D-7 이내 text-warning · D-3 이내 text-danger
```

- **대체 대상**: `Badge.tsx`의 `bg-primary/10` 계열 전면 교체, 상세 페이지 자체 `GENRE_COLORS` span(`audition/[id]/page.tsx:48-52,169-172`) 삭제 → `<Badge variant="genre">`. `AuditionCard.tsx:27`의 D-day Badge → D-day 텍스트로.

### 2.3 ListRow — 오디션 행 (카드 반복 대체)

`AuditionCard`(rounded-xl + shadow 카드)를 **row + divider** 리스트로 교체. 금지 목록의 "균일 카드 그리드" 해소.

- **해부도**: `<li>` > `<Link>`(전체 터치 영역) > [1행: 타이틀(2줄 클램프) ·· D-day 텍스트(우측 고정)] [2행: 회사명 메타] [3행: Badge 나열].

```tsx
<li className="border-b border-line-app">
  <Link href={`/audition/${id}`}
    className="block px-4 py-4 min-h-[44px] transition-colors active:bg-black/[.03]
               focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-[16px] font-semibold text-ink leading-snug line-clamp-2">{title}</h3>
      <span className="tabular shrink-0 text-[13px] font-semibold text-danger">D-3</span>
    </div>
    {company && <p className="mt-0.5 text-[13px] text-ink-40">{company}</p>}
    <div className="mt-2 flex items-center gap-1.5">
      <Badge variant="genre">{genre}</Badge>
      <Badge variant="oneclick">원클릭 지원</Badge>
    </div>
  </Link>
</li>
```

- **상태**: active(press 배경) / 마감(전체 `opacity-50` + D-day 자리 "마감") / 스켈레톤(§2.8).
- **대체 대상**: `AuditionCard.tsx` 삭제, history 리스트의 shadow-sm 카드 동일 패턴 전환.

### 2.4 AuditionDetail 필드 블록 (모노 라벨)

상세 페이지의 정보 필드를 콜시트 문서 형식으로. 카드 박스 대신 헤어라인 구획.

```tsx
<div className="border-b border-line-app py-3">
  <div className="label-mono">마감일 / DEADLINE</div>
  <div className="mt-1 flex items-baseline gap-2">
    <span className="text-[15px] text-ink">2026. 07. 24.</span>
    <span className="tabular text-[13px] font-semibold text-warning">D-7</span>
  </div>
</div>
```

- **대체 대상**: `audition/[id]/page.tsx`의 인디고 커스텀 섀도우 카드(`:166`)와 아이콘+텍스트 나열 블록.

### 2.5 BottomSheet — 지원 게이트/필터 공용 (신규)

프로필 게이트(02 §6.2 "인라인 바텀시트")와 탐색 필터(02 §6.1)가 같은 컴포넌트를 쓴다.

- **해부도**: 딤(`bg-black/40`) + 시트(surface, 상단 `rounded-t-[--radius-sheet]`, `shadow-overlay`) + 드래그 핸들(36×4px, `bg-black/15 rounded-full`, 상단 중앙 pt-2) + 헤더(타이틀 + 닫기 버튼) + 콘텐츠(스크롤) + 하단 CTA(safe-area 패딩).
- **구현**: `<dialog>` 기반(기존 Modal과 동일 계열) — 포커스 트랩·ESC·inert를 브라우저가 처리.

```tsx
<dialog ref={ref} aria-labelledby="sheet-title"
  className="m-0 mt-auto w-full max-w-md mx-auto bg-surface rounded-t-[--radius-sheet]
             shadow-overlay p-0 backdrop:bg-black/40
             open:animate-sheet-in backdrop:animate-dim-in
             max-h-[85dvh] overscroll-contain">
  <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-black/15" aria-hidden />
  <header className="flex items-center justify-between px-5 pt-3 pb-2">
    <h2 id="sheet-title" className="text-[16px] font-semibold">필터</h2>
    <button aria-label="닫기" className="grid size-11 place-items-center text-ink-40">…</button>
  </header>
  <div className="overflow-y-auto px-5 pb-4">{children}</div>
  <footer className="px-5 pb-[max(16px,env(safe-area-inset-bottom))]">
    <Button size="lg">적용</Button>
  </footer>
</dialog>
```

- **모션**: 등장 `translateY(100%)→0` 400ms `--ease-sheet`, 딤 페이드 250ms(§3 키프레임). 퇴장은 240ms ease-in 후 `close()`.
- **드래그 닫기**: 핸들 영역 `touchmove`로 시트 `translateY` 추적, 120px 초과 시 닫기(선택 구현 — v2에서는 닫기 버튼·딤 탭만으로도 충분).
- **상태**: 열림/닫힘/드래그 중/키보드 열림(콘텐츠에 인풋 있을 때 `max-h` 재계산은 `dvh`가 처리).

### 2.6 TabBar (5탭) & Header 3패턴

**TabBar** — `BottomNav.tsx` 개편:

```tsx
const TABS = [
  { href: "/home", label: "홈" }, { href: "/auditions", label: "탐색" },
  { href: "/applications", label: "지원" }, { href: "/community", label: "커뮤니티" },
  { href: "/my", label: "MY" },
];
const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/")
  || (tab.href === "/auditions" && pathname.startsWith("/audition/")); // 단수 상세 예외

<nav className="fixed bottom-0 inset-x-0 z-50 border-t border-line-app bg-surface
                pb-[env(safe-area-inset-bottom)]">
  <div className="mx-auto flex max-w-md">
    <Link aria-current={isActive ? "page" : undefined}
      className={cn("flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 min-h-[48px] text-[11px]",
        isActive ? "text-primary font-semibold" : "text-ink-40")}>
      <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} /><span>{label}</span>
    </Link>
  </div>
</nav>
```

- prefix 활성 판정으로 상세 페이지에서도 섹션 유지(02 §4 해결). 비로그인 시 지원/MY 탭은 로그인 시트 유도(리다이렉트 금지).

**Header 3패턴** — 현행 "로고+로그아웃" 단일 헤더 폐기:

| 패턴 | 구성 | 사용처 |
|---|---|---|
| 루트 | 좌: 워드마크(로그인 시 `/home`) · 우: 알림/검색 아이콘 | 탭 루트 5개 |
| 상세 | 좌: 뒤로가기(44px) · 중: 페이지 타이틀 22px→스크롤 시 16px · 우: 공유 등 1개 | 오디션/글 상세 |
| 태스크 | 좌: 닫기(X) · 중: 타이틀 · 우: "등록" 텍스트 버튼 | 글쓰기, 프로필 편집 |

공통 셸: `sticky top-0 z-40 h-13 border-b border-line-app bg-surface/85 backdrop-blur-sm` + `pt-[env(safe-area-inset-top)]`. 로그아웃은 MY로 이동.
- **대체 대상**: `Header.tsx` + 각 페이지 자체 뒤로가기 3벌(`audition/[id]:157`, `community/[id]:196`, `community/write:83`).

### 2.7 Chip / 필터 (3벌 → 1종)

```tsx
<button role={multi ? "checkbox" : "radio"} aria-checked={selected}
  className={cn("inline-flex h-9 items-center rounded-[--radius-control] border px-3
                 text-[13px] font-medium transition-colors duration-150 active:scale-[0.98]",
    selected ? "border-ink bg-ink text-ink-inverse"     // 선택 = 잉크 반전 (primary 남용 금지)
             : "border-line bg-surface text-ink-70")} />
```

- 가로 스크롤 랙: `flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]`.
- **대체 대상**: `AuditionFilter.tsx` 칩, 커뮤니티 카테고리 칩(`community/page.tsx:185`), 글쓰기 카테고리 칩(`write/page.tsx:114`). 필터 축 분리(카테고리=칩 랙, 지원방식·지역=BottomSheet)는 02 §6.1 따름.

### 2.8 Skeleton (shimmer)

```css
@utility skeleton {
  /* 장식용 그라데이션 아님 — shimmer 유일 예외, 뉴트럴 한정 */
  background: linear-gradient(90deg, #F0F0EE 25%, #FAFAF7 50%, #F0F0EE 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s ease-in-out infinite; border-radius: 6px;
}
@keyframes shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
```

- ListRow 스켈레톤: 타이틀 2줄(w-3/4, w-1/2) + 배지 자리(h-5 w-14 ×2), 행 높이 실물과 동일(레이아웃 시프트 0). 최초 5행만 렌더.
- **대체 대상**: Loader2 스피너 블록 8곳 전부. 스피너 전면 금지.

### 2.9 Toast (2종 → 1종)

```tsx
<div role="status" aria-live="polite"
  className="fixed left-1/2 -translate-x-1/2 bottom-[calc(64px+env(safe-area-inset-bottom)+12px)]
             z-[60] flex items-center gap-2 rounded-[--radius-control] bg-dark text-ink-inverse
             px-4 py-3 text-[14px] shadow-raised animate-toast-in">
  <CheckIcon className="size-4 text-success" /> 지원이 완료되었어요
  {action && <button className="ml-2 font-semibold text-white underline underline-offset-2">이력 보기</button>}
</div>
```

- 다크 단일 스타일(컬러 배경 토스트 폐기), 아이콘으로만 성공/실패 구분. 하단 TabBar 위 고정, 3초 자동 소멸, 액션 버튼 1개 허용(A7 후속 행동).
- Provider: `ToastProvider` + `useToast()` 훅, `components/ui/Toast.tsx` 신규.
- **대체 대상**: ApplyButton 내장 ResultToast(`ApplyButton.tsx:316-349`), 커뮤니티 공유 토스트(`community/[id]/page.tsx:307-312`).

### 2.10 EmptyState

```tsx
<div className="flex flex-col items-center px-6 py-16 text-center">
  <Icon className="size-10 text-ink-40" strokeWidth={1.5} />   {/* 스트로크 아이콘, 이모지 금지 */}
  <p className="mt-4 text-[16px] font-semibold text-ink">아직 지원한 오디션이 없어요</p>
  <p className="mt-1 text-[14px] text-ink-70">마음에 드는 공고를 찾아 첫 지원을 시작해 보세요.</p>
  <Button variant="secondary" size="md" className="mt-5">오늘의 공고 보기</Button>
</div>
```

- 필수 3요소: 아이콘 + 상황 설명 + **탈출 CTA**(데드엔드 금지). 검색 0건/이력 0건/마감 상세 회유("비슷한 오디션") 공용.

### 2.11 프로필 완성도 링

홈 상단 프로필 카드용. SVG 원형 프로그레스 + 중앙 퍼센트.

```tsx
<svg viewBox="0 0 40 40" className="size-12 -rotate-90">
  <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-line)" strokeWidth="3.5" />
  <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-primary)" strokeWidth="3.5"
    strokeLinecap="round" strokeDasharray={2 * Math.PI * 17}
    strokeDashoffset={2 * Math.PI * 17 * (1 - pct / 100)}
    className="transition-[stroke-dashoffset] duration-[400ms] ease-[--ease-out]" />
</svg>
<span className="tabular text-[13px] font-bold text-ink">{pct}%</span>
```

- 100% 도달 시 링 stroke를 success로 1회 전환. 퍼센트 계산: 지원 필수 필드 가중(이름·나이·성별·분야·사진 = 70%), 포트폴리오 필드 30%.

### 2.12 온보딩 스텝퍼 (3스텝 바텀시트 헤더)

```tsx
<div className="flex items-center gap-2 px-5" aria-label={`3단계 중 ${step}단계`}>
  <span className="label-mono">STEP {step}/3</span>
  <div className="flex flex-1 gap-1">
    {[1,2,3].map(i => (
      <div key={i} className={cn("h-0.5 flex-1 rounded-full transition-colors duration-250",
        i <= step ? "bg-ink" : "bg-line")} />
    ))}
  </div>
  <button className="text-[13px] text-ink-40 min-h-[44px]">건너뛰기</button>
</div>
```

- 스텝 전환: 콘텐츠 fade+slide 8px 200ms(탭 전환과 동일 모션). Step3(사진)은 "나중에 하기" 상시 노출.

---

## 3. 모션 구현 가이드

### 3.1 키프레임·유틸 정의 (globals.css에 추가)

```css
@theme inline {
  --animate-sheet-in: sheet-in var(--dur-slow) var(--ease-sheet) both;
  --animate-dim-in: dim-in var(--dur-base) ease-out both;
  --animate-toast-in: toast-in var(--dur-base) var(--ease-out) both;
  --animate-row-in: row-in var(--dur-base) var(--ease-out) both;
  --animate-tab-in: tab-in 200ms var(--ease-out) both;
}
@keyframes sheet-in { from { transform: translateY(100%) } to { transform: translateY(0) } }
@keyframes dim-in   { from { opacity: 0 } to { opacity: 1 } }
@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px) } to { opacity: 1; transform: translate(-50%, 0) } }
@keyframes row-in   { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@keyframes tab-in   { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
```

### 3.2 탭 전환 (App Router)

각 탭 루트 페이지 최상위 래퍼에 `animate-tab-in` — 라우트 마운트 시 1회 fade+slide 8px 200ms. 탭 인디케이터는 색/굵기 전환(`transition-colors duration-250`)으로 충분(레이아웃 애니메이션 불요).

### 3.3 리스트 스태거

```tsx
// IntersectionObserver 1개 공유 훅: useRevealOnce()
<li ref={observe} style={{ "--i": index % 10 } as React.CSSProperties}
    className="opacity-0 data-[shown]:animate-row-in data-[shown]:[animation-delay:calc(var(--i)*35ms)]" />
```

- 아이템당 35ms 딜레이, 뷰포트 진입 시 1회만(`unobserve`). 무한스크롤 추가분은 페이지 단위로 인덱스 리셋(`% 10`)해 누적 딜레이 방지.

### 3.4 페이지 전환 (리스트 → 상세)

- 기본: 상세 페이지 콘텐츠에 `animate-tab-in`(동일 primitive 재사용) — CSS만으로 충분.
- 고급(선택): React 19 + Next 16의 **View Transitions API**(`next.config` `experimental.viewTransition`)로 리스트 타이틀 → 상세 타이틀 shared-element. 폴백 자동(미지원 브라우저는 즉시 전환)이라 리스크 없음.
- **라이브러리 권고 (1개)**: CSS로 부족한 건 시트 드래그 제스처·exit 애니메이션뿐이므로, 도입한다면 **Framer Motion(`motion`)** 하나만 — `drag="y"` + `AnimatePresence`가 BottomSheet 드래그 닫기를 대체. GSAP 등 추가 금지.

### 3.5 reduced-motion 전략

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- 콘텐츠는 항상 보이게(스태거 초기 `opacity-0`은 animation 완료값 both로 즉시 도달하므로 안전). shimmer는 정지된 단색(#F0F0EE)으로 남는다. 스크롤 리빌·워드 스태거는 인스턴트 표시. JS 제스처(시트 드래그)는 유지하되 스냅 애니메이션만 즉시 완료.

---

## 4. 통합·삭제 계획 (02 §5 매핑)

| 02 진단 항목 | 현재 위치 | 신규 시스템 귀속 | 조치 |
|---|---|---|---|
| 토스트 2종 | `ApplyButton.tsx:316-349` / `community/[id]:307-312` | `ui/Toast.tsx` + `ToastProvider` (§2.9) | 내장 ResultToast 삭제, `useToast()` 호출로 교체 |
| `timeAgo()` 3벌 | `community/page.tsx:38` 외 2곳 | `lib/datetime.ts` 단일 export | 3곳 import 교체 후 로컬 정의 삭제 |
| `CATEGORY_COLORS` 3벌 | 위와 동일 3파일 | `lib/categories.ts` (라벨+variant 매핑) → `<Badge variant="genre">` | 색상 하드코딩 자체 폐기(장르 배지는 단일 뉴트럴) |
| 필터 칩 3벌 | `AuditionFilter.tsx` / `community/page.tsx:185` / `write/page.tsx:114` | `ui/Chip.tsx` (§2.7) | 3곳 교체, AuditionFilter는 Chip 랙 + BottomSheet 조합으로 재작성 |
| 섀도우 2체계 | `shadow-sm` vs 인디고 커스텀 섀도우 | `--shadow-raised` 단일 토큰 | 인디고(컬러) 섀도우 전면 삭제 — 금지 목록 위반 |
| 장르 배지 2체계 | `AuditionCard.tsx:30` vs `audition/[id]:48-52` | `ui/Badge.tsx` 4종 규칙 (§2.2) | 상세의 자체 span 삭제 |
| 버튼 이원화 | 생 button/Link 산재 | `ui/Button.tsx` (§2.1) | variant 매핑 후 생 스타일 제거 |
| Loader2 스피너 8곳 | 전 페이지 | `ui/Skeleton.tsx` (§2.8) | 스피너 전면 삭제 |
| native `alert/confirm` | `PhotoUpload.tsx:40,43` 외 | 기존 `ui/Modal.tsx`(확인용) + Toast(알림용) | confirm→Modal, alert→Toast |
| 데드코드 3파일 | `hooks/useProfile.ts`, `hooks/useApplyLimit.ts`, `lib/dummy-data.ts` | 귀속 없음 | **즉시 삭제** (import 0 확인됨) |
| 랜딩 하드코딩 hex | `app/page.tsx` (`#6366F1`) | §1.1 토큰 | 구 인디고(#6366F1)는 신규 primary(#4F46E5)로 통일 |
| 브랜드 표기 혼용 | "AUDITIONPASS" vs "오디션패스" | 워드마크 규칙: 본문 "오디션패스", 모노 라벨 맥락만 "AUDITIONPASS" | 랜딩 워드마크 컴포넌트화 |

**삭제 우선순위**: 데드코드 3파일(즉시) → 토큰 교체(§1) → Toast/Chip/Badge 공용화 → ListRow 전환(화면 단위) 순. 토큰이 먼저 깔려야 컴포넌트 교체가 안전하다.

---

## 5. 접근성 체크리스트

- [ ] **포커스 링**: 모든 인터랙티브 요소 `focus-visible:outline-2 outline-offset-2 outline-primary` (ring+offset 구방식 금지, ListRow는 `-outline-offset-2`로 내부 링)
- [ ] **대비 4.5:1**: 본문 ink-70/surface = 8.9:1 ✓ · ink-40은 13px 미만 본문 텍스트 금지(4.5:1 미달 경계 — 메타·라벨 한정) · primary/white 버튼 = 6.3:1 ✓ · warning(#F59E0B)/white 텍스트 사용 금지(D-day는 텍스트 컬러로만, 15px 이상 semibold)
- [ ] **터치 타겟 44px**: Button md/lg, TabBar 48px, 헤더 아이콘 버튼 44px, Chip은 h-9(36px)이므로 상하 `py` 히트 영역 보정 or 랙 자체 여백 확보. `sm` 버튼은 마우스 문맥 한정
- [ ] **핀치줌**: `layout.tsx`의 `viewport.maximumScale: 1` 제거 (02 §4 지적)
- [ ] **BottomSheet 키보드/스크린리더**: `<dialog>.showModal()`로 포커스 트랩·ESC·배경 inert 자동 확보 · 열릴 때 첫 포커스는 닫기 버튼 아닌 시트 컨테이너(`tabIndex={-1}`) · `aria-labelledby` 필수 · 닫히면 트리거 버튼으로 포커스 복귀 · 드래그 핸들은 `aria-hidden`(닫기 수단은 버튼으로 별도 제공)
- [ ] **Toast**: `role="status"` + `aria-live="polite"`, 포커스 훔치지 않기, 액션 버튼 있으면 자동 소멸 6초로 연장
- [ ] **TabBar**: `aria-current="page"`, 아이콘만으로 의미 전달 금지(라벨 상시 노출 유지)
- [ ] **스텝퍼**: 단계 변경 시 `aria-live`로 "3단계 중 2단계" 고지
- [ ] **죽은 버튼 금지**: 비로그인 답글 버튼(C2) 같은 무반응 UI 제거 — 항상 로그인 시트로 응답
- [ ] **reduced-motion**: §3.5 전역 오버라이드 적용 확인 (수동 QA: OS 설정 켜고 시트/스태거/shimmer 점검)
- [ ] **스켈레톤**: `aria-busy="true"` + 스크린리더용 "불러오는 중" `sr-only` 텍스트 1개(스켈레톤 개별 요소는 `aria-hidden`)

---

*다음 단계: 이 스펙 기준으로 Phase 3 시안(24_)과 컴포넌트 구현 티켓 분해. 모든 시각 판단의 최종 기준은 `20_design-language.md`.*
