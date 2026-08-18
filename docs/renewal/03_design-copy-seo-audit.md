# 오디션패스 디자인·카피·SEO 진단 (03)

> 작성일: 2026-07-15 · 진단 범위: `frontend/src` 전체 + 라이브 사이트(auditionpass.co.kr) 실측
> 진단 기준: de-ai-ify(AI 패턴 47종), homepage-audit(전환 스코어링), copywriting, seo-audit, high-end-visual-design / design-taste-frontend(AI-slop 금지 패턴), brand-guidelines(오디션패스 톤앤매너)

---

## 0. 요약

| 축 | 점수 | 한 줄 진단 |
|---|---|---|
| **디자인** | **4 / 10** | 깨끗하고 기능은 하지만, "AI가 만든 SaaS 템플릿"의 전형. 인디고→핑크 그라데이션, 이모지 아이콘, 3열 카드 그리드, 균일한 rounded-2xl 카드가 랜딩 전체를 지배. 앱 내부는 무난하나 브랜드 개성 0. |
| **카피** | **5 / 10** | 페인 포인트는 정확히 짚었으나(수집·마감·반복입력), 헤드라인이 '기능 설명'에 머묾. 타겟(배우 지망생)의 열망("무대에 서고 싶다")과 브랜드 톤("나도 거기서 시작했어")이 카피에 전혀 없음. 사회적 증거 0. |
| **SEO** | **6 / 10** | 메타·OG·JobPosting 스키마 등 골격은 상위권. 그러나 **라이브 sitemap이 정적 5개 URL로 동결(2026-04-08)되어 오디션 상세 500건이 사이트맵에 없음**(신규 발견, 최우선). 커뮤니티는 여전히 SEO 사각지대. |

**핵심 결론**: 지금 사이트는 "못 만든 사이트"가 아니라 "누가 만들어도 이렇게 나오는 사이트"다. 에이전시급으로 가는 열쇠는 (1) AI-slop 시각 언어 제거, (2) 배우 지망생의 열망을 파는 카피, (3) sitemap 동결 해제 + 커뮤니티 SSR 전환.

---

## 1. AI-slop 디자인 패턴 전수 조사

### 1-1. 랜딩 페이지 (`frontend/src/app/page.tsx`)

| # | 패턴 | 증거 (파일:라인) | 왜 문제인가 |
|---|---|---|---|
| 1 | **인디고→퍼플→핑크 그라데이션 히어로 배경** | `page.tsx:70` `bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50` | design-taste "THE LILA BAN" — AI가 가장 많이 뽑는 배경. 브랜드 컬러(#6366F1)가 아니라 'AI 보라 안개'로 읽힘. Pricing 카드(`:283`)에도 동일 그라데이션 반복. |
| 2 | **Gradient text 헤드라인** | `page.tsx:78` `bg-gradient-to-r from-[#6366F1] to-[#EC4899] bg-clip-text text-transparent` | design-taste 금지 패턴 "NO Excessive Gradient Text". H1에 그라데이션 텍스트 = 2023년 AI 랜딩의 시그니처. |
| 3 | **이모지 아이콘 (😩 ⏰ 📝)** | `page.tsx:133, 139, 145` | design-taste "ANTI-EMOJI POLICY [CRITICAL]". 페인 포인트 3카드의 얼굴이 이모지 — 프리미엄 인상을 즉사시키는 1순위 요소. |
| 4 | **뻔한 3열 균일 feature 카드 그리드** | `page.tsx:130` `grid-cols-1 md:grid-cols-3` + `:153` `rounded-2xl p-8 border hover:-translate-y-1 hover:shadow-lg` | design-taste "NO 3-Column Card Layouts (BANNED)". 아이콘박스+제목+설명의 동일 구조 3연발. hover 리프트까지 표준 세트. |
| 5 | **센터 정렬 히어로 풀세트** (배지 pill → H1 → 서브 → CTA 2개 → 통계 3개) | `page.tsx:71–114` | design-taste Rule 3 "ANTI-CENTER BIAS". 요소 구성·순서가 AI 표준 출력과 1:1 일치. 레이아웃 자체가 템플릿 선언. |
| 6 | **라운드 넘버 통계 3종 세트 (500+ / 10+ / 24h)** | `page.tsx:103–113` | design-taste "NO Fake Numbers" — 수치 자체는 사실이어도 `N+` 라운드 넘버 3개 나란히 배치는 전형적 AI 신뢰 장치. 특히 "10+ 크롤링 사이트"는 유저에게 무의미한 내부 지표(유저는 크롤링을 모름). |
| 7 | **영어 uppercase eyebrow 라벨 (Problem / Solution / How it works / Pricing)** | `page.tsx:121–123, 173–175, 228–230, 273–275` | 한국어 서비스에서 섹션마다 영어 eyebrow — AI 템플릿의 잔재. 타겟(국내 지망생)과 무관한 장식. |
| 8 | **그라데이션 pill 배지 "OPEN EVENT"** | `page.tsx:284` `bg-gradient-to-r from-[#6366F1] to-[#EC4899]` | 그라데이션 배지 + 영어 트래킹 텍스트 = AI-slop 이중 콤보. |
| 9 | **보라 그라데이션 Final CTA 밴드** | `page.tsx:320` `bg-gradient-to-br from-[#4F46E5] to-[#7C3AED]` | 페이지 4번째 그라데이션. "마지막에 보라색 풀폭 CTA 배너"는 AI 랜딩의 마침표. |
| 10 | **인디고 글로우 그림자 버튼** | `page.tsx:90, 311` `shadow-lg shadow-indigo-300/30` | design-taste "NO Neon/Outer Glows". 채색 글로우는 저가 템플릿 신호. |
| 11 | **숫자 원 4개 스텝 (How it works)** | `page.tsx:257` `w-16 h-16 rounded-full bg-[#6366F1]` × 4 | 색칠된 원 안 숫자 + 균일 간격 — AI가 'how it works'에 항상 뽑는 구조. |
| 12 | **투톤 로고 타이포 (AUDITION`PASS`)** | `page.tsx:49–51` 인디고+핑크 | 두 색으로 쪼갠 텍스트 로고는 로고가 없다는 자백. 브랜드 자산 부재. |

### 1-2. 앱 내부 화면

| # | 패턴 | 증거 | 비고 |
|---|---|---|---|
| 13 | **균일한 rounded-xl/2xl + shadow 카드의 무한 반복** | `AuditionCard.tsx:18` `rounded-xl bg-white p-5 shadow-sm hover:shadow-md` / `community/page.tsx:236` 동일 구조 / `audition/[id]/page.tsx:166, 231` | 리스트·상세·커뮤니티 전부 같은 흰 카드. design-taste Rule 4 "Anti-Card Overuse" — 위계 전달 없이 전부 박스. 인디고 틴트 매직넘버 섀도(`shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(99,102,241,0.06)]`)가 2곳에 하드코딩 중복. |
| 14 | **범용 원형 스피너 로딩 (Loader2)** | `auditions/page.tsx:183, 204, 224` / `community/page.tsx:204, 224` / `profile/page.tsx:37` / `audition/[id]/page.tsx:130` | design-taste Rule 5: 스켈레톤 로더 0개, 전 화면이 돌아가는 스피너. 체감 속도·완성도 모두 하락. |
| 15 | **인디고→퍼플 그라데이션 HOT 배너** | `community/page.tsx:156` `from-indigo-50 to-purple-50` | 앱 내부까지 보라 그라데이션 침투. |
| 16 | **아이콘+2줄 텍스트의 전형적 empty state** | `auditions/page.tsx:192–196`, `community/page.tsx:208–212` | 흐린 lucide 아이콘 + "~가 없습니다" — 기능은 하나 브랜드 보이스 없음. |
| 17 | **굵은 스트로크 lucide-react 아이콘 전면 사용** | `package.json:18`, 전 컴포넌트 | high-end-visual-design 기준 'generic 아이콘'. 교체까진 아니어도 strokeWidth 통일·경량화 필요. |
| 18 | **폰트 로딩: CSS `@import` CDN** | `globals.css:1` `@import url('...pretendard.css')` | Pretendard 선택 자체는 좋으나(=Inter 회피 성공) `next/font` 미사용으로 렌더 블로킹 + FOUT. 디자인·성능 동시 감점. |

### 1-3. 그나마 잘한 것 (지킬 것)
- 이모지가 앱 내부 UI에는 없음 (랜딩에만 존재)
- Pretendard 채택 (Inter/Roboto 회피)
- 배지 컬러 시스템(원클릭=emerald, D-day=red/amber)이 brand-guidelines와 일치
- 모바일 max-w-md 단일 컬럼 앱 셸은 타겟 사용 맥락(폰으로 공고 확인)과 정합

---

## 2. 랜딩 카피 진단

homepage-audit 스코어링 기준(SaaS형, 전환 목표=회원가입) 적용.

### 2-1. 히어로 (Above the Fold) — 3/5

**현재 H1**: "오디션 정보, 한 곳에서 끝내세요" (`page.tsx:75–81`)

- **평가**: '기능(수집) 중심' 헤드라인. rubric상 Score 3 — "[Feature]-powered [category]" 단계. 나쁘지 않지만 잊혀지는 카피.
- **결정적 결함**: 타겟은 "정보를 모으고 싶은 사람"이 아니라 **"무대에 서고 싶은 사람"**이다. 열망(무대·배역·데뷔)이 아니라 편의(한 곳에서)를 팔고 있음.
- **톤 불일치**: brand-guidelines의 톤 "친근하지만 믿음직한 선배(나도 거기서 시작했어)"가 카피 어디에도 없음. 현재는 중립적 SaaS 존댓말.

**개선 방향 (예시 — 최종 카피는 다음 단계)**:
- 열망형: "오늘도 무대는 열린다 — 지원할 오디션이 매일 아침 도착합니다"
- 페인 역전형: "새벽까지 카페 뒤지지 마세요. 오디션이 당신을 찾아옵니다"
- 실데이터형(추천): "**오늘 올라온 배우·모델 오디션 {N}건**" — 통계 3종 대신 DB 연동 실시간 수치 1개가 100배 강력. `500+`보다 "오늘 34건"이 신뢰·긴급성 모두 우위.

### 2-2. CTA — 2.5/5

- "무료로 시작하기"가 nav·히어로·Pricing·Final CTA에서 **4회 반복** (`page.tsx:63, 92, 313, 333`). copywriting 기준 '무엇을 얻는지' 없는 generic CTA.
- 보조 CTA "오디션 둘러보기"(`:98`)가 오히려 강함 — 가입 없이 가치를 먼저 보여주는 저마찰 동선인데 시각적으로 죽어 있음(흰 버튼).
- **개선 방향**: Primary를 "오늘 올라온 오디션 보기"(로그인 없이 리스트 진입 → 상세에서 지원 시점에 가입 유도)로 뒤집는 A/B 가치 있음. 가입형 유지 시 "3초 만에 지원 준비 끝내기"처럼 결과를 명시.

### 2-3. 섹션 카피

| 섹션 | 평가 | 근거 |
|---|---|---|
| Problem (`:118–168`) | **4/5 — 가장 좋은 카피** | "카페, 블로그, 인스타… 최소 5곳"은 진짜 유저 언어. 다만 도입부 "이런 고민 있으셨죠?" + "공통적인 문제입니다"는 hedging — 선배 톤이라면 "나도 매일 밤 카페 새로고침부터 했다"로 직진 가능. |
| Solution (`:170–223`) | 3/5 | "오디션패스가 해결합니다" = 회사 관점 화법. 유저 관점("이제 확인은 아침 1분이면 됩니다")으로 전환 필요. 배지 "3초 만에 지원"은 좋은 구체성 — 이런 문장이 H1급으로 승격돼야 함. |
| How it works (`:225–268`) | 3/5 | 무난. "이메일로 30초 만에 가입" 구체성 좋음. |
| Pricing (`:270–317`) | 2.5/5 | "지금은 모든 기능이 무료!"의 '지금은'이 불안 유발(나중에 과금?). "오픈 기념"과 결합해 임시 서비스 인상. → "베타 기간 전 기능 무료 — 유료 전환 시 기존 가입자 혜택 우선 안내" 식으로 신뢰 언어 필요. |
| 사회적 증거 | **0/5 — 전무** | 후기·합격 사례·사용자 수·커뮤니티 글 인용이 랜딩에 하나도 없음. 초기라 합격 후기가 없다면 커뮤니티 실제 글("셀프테이프 팁 …") 인용, 수집 소스 로고(필름메이커스 등은 권리 확인 필요 시 "10개 캐스팅 사이트" 명시)로 대체 가능. |

### 2-4. 카피 종합
- **강점**: 페인 정의 정확, 과장 없음(brand-guidelines DON'T 준수), 느낌표 절제.
- **약점**: ① 열망 부재 ② 선배 톤 부재 ③ 사회적 증거 0 ④ CTA 단조 ⑤ '기능 나열'이지 '이야기'가 아님.
- **다음 단계 카피 작성 시 축**: "선배가 후배에게 말하듯" 1인칭 어투 도입부 + 실시간 수치 헤드라인 + 저마찰 CTA 우선.

---

## 3. SEO 체크리스트 (GROWTH_PLAN §1 대조 + 신규 발견)

### 3-1. GROWTH_PLAN 기재 결함 — 현재 상태

| GROWTH_PLAN 항목 | 당시 | 현재 상태 | 증거 |
|---|---|---|---|
| 🔴 ① 카카오톡 공유 OG 이미지 전무 | 미해결 | ✅ **대부분 해결** — 루트 동적 OG(`app/opengraph-image.tsx`, 브랜드 카드) + 오디션 상세 동적 OG(`audition/[id]/opengraph-image.tsx`, 제목·주최사·D-day 카드) 구현 완료. ⚠️ 커뮤니티 상세 OG는 여전히 없음. | `frontend/src/app/opengraph-image.tsx`, `frontend/src/app/(main)/audition/[id]/opengraph-image.tsx:17–27` |
| 🔴 ② 커뮤니티 SEO 방치 | 미해결 | ❌ **미해결** — `/community/[id]`는 `"use client"` 그대로, `generateMetadata`·Article 스키마·layout 없음. sitemap에도 커뮤니티 URL 0개. 후기/꿀팁 롱테일 유입 여전히 0. | `community/[id]/page.tsx:1`, `sitemap.ts` 전체 |
| 🟡 ③ 오디션 상세 본문 클라이언트 렌더 | 미해결 | ❌ **미해결** — `page.tsx:1` `"use client"` + `useEffect` fetch. 메타/스키마는 서버(layout)라 색인은 되지만 본문 HTML이 빈 채로 전달. | `audition/[id]/page.tsx:1, 67–82` |
| 🟡 ④ 리스트 페이지 메타 없음 | 미해결 | ❌ **미해결** — `/auditions`, `/community` 모두 `"use client"`로 메타 export 불가 구조. 필터 쿼리 URL(`?filter=…&q=…`)이 canonical 없이 무한 변형 생성. | `auditions/page.tsx:1, 33–42`, `community/page.tsx:1` |
| 🟢 ⑤ Organization / BreadcrumbList 스키마 | 미해결 | ❌ **미해결** — 코드베이스에 JobPosting 외 스키마 없음. | `audition/[id]/layout.tsx:82–104`만 존재 |

### 3-2. 신규 발견 (이번 진단에서 추가)

| 심각도 | 발견 | 증거 | 처방 |
|---|---|---|---|
| 🔴 **최우선** | **라이브 sitemap이 정적 5개 URL로 동결** — 실측 결과 `sitemap.xml`에 홈/auditions/login/signup/pricing 5개뿐, `lastModified` 전부 **2026-04-08 고정**. 코드상 "오디션 500건 포함" 로직이 프로덕션에서 죽어 있음. 원인 후보: ① sitemap 라우트가 빌드타임 정적 생성 후 재검증 없음(4/8 빌드 산출물 캐시) ② 빌드 시 Supabase env 미주입 → `catch`가 조용히 삼킴(`sitemap.ts:68–70`). | 라이브 fetch 실측 + `sitemap.ts:44–70` | `export const revalidate = 3600` 등 재검증 주기 부여 또는 route handler 전환, catch에서 로깅. **오디션 상세 500페이지가 사이트맵에서 빠진 것 = 색인 파이프라인 절반이 끊긴 상태.** |
| 🔴 | **JobPosting 스키마가 Google Jobs 필수 필드 미달** — `validThrough`는 있으나 `employmentType`, `directApply`, 구체적 `jobLocation`(주소가 국가 코드뿐), `baseSalary` 부재. 리치 결과 탈락 가능성 높음. | `audition/[id]/layout.tsx:82–104` | 최소 `employmentType: "CONTRACTOR"`, `directApply: true`, 지역 필드(수집 데이터 확장과 연계 — GROWTH_PLAN §3) 보강. |
| 🟡 | **`maximumScale: 1`로 핀치 줌 차단** | `layout.tsx:48` | 접근성 위반(WCAG 1.4.4) + Lighthouse 접근성 감점. 제거 권장. |
| 🟡 | **Pretendard CSS `@import`** — 렌더 블로킹 → LCP 지연 (Core Web Vitals) | `globals.css:1` | `next/font/local` 또는 서브셋 프리로드 전환. |
| 🟡 | **audition 상세 meta description 원문 슬라이스** — `description.slice(0, 155)`에 개행·이모지·전각 기호가 그대로 들어감 → SERP 스니펫 품질 저하. | `audition/[id]/layout.tsx:33–35` | 공백 정규화 + 문장 경계 절단 유틸 추가. |
| 🟡 | **동일 Supabase 쿼리 2회 실행** — `generateMetadata`와 layout 본문이 같은 row를 각각 fetch. `React.cache`/`unstable_cache` 미사용 → TTFB 손해. | `audition/[id]/layout.tsx:16–27, 69–80` | fetch 함수 `cache()` 래핑. |
| 🟢 | keywords meta는 검색엔진 무시 대상(무해, 유지 무방) | `layout.tsx:14–24`, `page.tsx:8–23` | — |
| 🟢 | robots.ts 정상(비공개 경로 차단 적절), 루트 title template·GSC 검증·canonical 정상 | `robots.ts:11`, `layout.tsx:8–11, 39–41` | — |

### 3-3. 라이브 실측 요약
- `https://auditionpass.co.kr` 정상 렌더, 코드와 일치 (히어로·통계·섹션 구성 동일 확인)
- `sitemap.xml` → **5 URL, 2026-04-08 동결** (상기 최우선 이슈)
- 랜딩 H1 1개, 시맨틱 구조(nav/section/article/footer) 자체는 양호

### 3-4. SEO 우선순위 액션 (임팩트 순)
1. **sitemap 동결 해제 + 오디션 500건 재등재** (색인 회복, 반나절)
2. 커뮤니티 상세 `generateMetadata` + BlogPosting 스키마 + sitemap 등재 + 동적 OG (롱테일 신규 유입)
3. 오디션 상세 본문 서버 컴포넌트 전환 (색인 품질)
4. `/auditions` 정적 메타 + canonical, 카테고리 랜딩 14개 (GROWTH_PLAN 기존 계획 유지)
5. JobPosting 필드 보강 → Google Jobs 노출
6. maximumScale 제거 + next/font 전환 (CWV·접근성)

---

## 4. 프리미엄 업그레이드 방향 제안

전제: 타겟은 "아직 유명하지 않지만 유명해지고 싶은" 배우·모델 지망생. 이들이 동경하는 시각 세계는 **작품 포스터, 매거진 화보, 무대 조명**이지 SaaS 대시보드가 아니다. Primary 인디고는 유지하되 '보라 안개'가 아닌 '단일 시그니처 컬러'로 재정의한다.

### 방향 A — 「캐스팅 콜 시트」 에디토리얼 (랜딩 추천안)
- **무드**: 영화 잡지·캐스팅 보드. 순백 배경, 커다란 명조 디스플레이 타이포(마루 부리/Noto Serif KR) + Pretendard 본문, 얇은 괘선(hairline rule) 그리드, 흑백 인물 사진에 인디고 1색 포인트.
- **근거**: ① 지망생의 열망 대상(화보·작품)과 동일한 시각 언어 → "이 서비스를 쓰면 나도 저 세계에 간다"는 정서 ② de-ai-ify/design-taste가 금지하는 그라데이션·글로우·3열 카드와 구조적으로 결별 ③ 한국 무료 폰트(마루 부리)로 라이선스 리스크 없음.
- **랜딩 적용**: 좌측 정렬 분할 히어로(타이포 좌 / 실시간 공고 티커 우), 통계 3종 → "오늘 올라온 공고 N건" 라이브 카운터 1개, 이모지 → 얇은 라인 아이콘 또는 번호 괘선.
- **리스크**: 명조 디스플레이는 앱 내부 정보 UI에는 부적합 → 랜딩·OG·브랜드 표면에만 사용.

### 방향 B — 「스포트라이트」 시네마틱 다크
- **무드**: 오프블랙(#0E0E13, 순흑 금지) + 스포트라이트 라디얼 광원 1개 + 미세 필름 그레인. 인디고는 네온 글로우가 아니라 '무대 조명 색'으로 사용. D-day 레드가 어둠 위에서 극대화.
- **근거**: ① "당신의 다음 무대" 슬로건과 조명 메타포 직결 ② 공고 확인이 밤 시간대에 몰리는 사용 맥락 ③ 경쟁 캐스팅 사이트(필름메이커스 등)가 전부 라이트 게시판형이라 차별화 극대.
- **리스크**: 텍스트 밀도 높은 공고 본문의 다크 가독성, 라이트/다크 이중 유지 비용. 랜딩+OG만 다크, 앱은 라이트 유지하는 절충 가능.
- **적합**: 브랜드 임팩트 최우선일 때. 단, brand-guidelines의 "정보 중심" 원칙과는 긴장 관계.

### 방향 C — 「콜시트 유틸리티」 클린 미니멀 (앱 내부 추천안)
- **무드**: 카드 제거. `divide-y` 괘선 리스트, 넉넉한 행간, D-day·마감일 숫자는 모노스페이스(Geist Mono/JetBrains Mono)로 표기해 '실무 도구' 밀도. 인디고 + 뉴트럴 + 시맨틱 3색만.
- **근거**: ① 서비스의 본체는 랜딩이 아니라 매일 여는 리스트 화면 — 도구적 신뢰가 리텐션 자산 ② brand-guidelines "정보 중심 — 꾸밈보다 가독성 우선"과 정확히 정합 ③ design-taste Rule 4(카드 남용 금지) 직접 처방: 현재 '흰 카드 무한 반복'을 구조적으로 해소 ④ 스켈레톤 로더·엠티 스테이트에 선배 톤 마이크로카피를 심을 그릇.
- **리스크**: 단독으로는 밋밋 → 방향 A의 타이포 자산과 결합해야 브랜드가 남음.

### 추천 조합
**A(랜딩·브랜드 표면) + C(앱 내부)** 하이브리드. 랜딩은 에디토리얼 타이포로 열망을 팔고, 앱은 괘선 유틸리티로 신뢰를 판다. 공통 규칙: 그라데이션 전면 금지, 이모지 금지, 채색 글로우 금지, 시그니처 인디고 1색 + 시맨틱 컬러만, 모든 로딩은 스켈레톤. B(다크)는 인스타 콘텐츠·OG 이미지 등 마케팅 표면의 서브 테마로 활용하면 세 방향의 장점을 모두 회수할 수 있다.

---

*근거 스킬: de-ai-ify v2.0, homepage-audit(Brian Wagner), copywriting v1.1, seo-audit v1.1, high-end-visual-design, design-taste-frontend, brand-guidelines(오디션패스)*
