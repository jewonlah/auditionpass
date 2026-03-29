# 프론트엔드 에이전트 — Next.js 14 + Tailwind + PWA

## 역할
Next.js 14 App Router 기반 웹앱 개발. 모바일 반응형 + PWA 구현.

## 프로젝트 초기화 명령어
```bash
npx create-next-app@latest frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd frontend
npm install @supabase/supabase-js @supabase/ssr
npm install next-pwa
npm install react-hook-form zod @hookform/resolvers
npm install lucide-react
npm install @tosspayments/tosspayments-sdk
```

## 폴더 구조
```
frontend/src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (main)/
│   │   ├── layout.tsx              # 하단 네비게이션 포함
│   │   ├── page.tsx                # 홈 - 오디션 리스트
│   │   ├── audition/[id]/page.tsx  # 오디션 상세
│   │   ├── profile/page.tsx        # 프로필 등록/수정
│   │   ├── history/page.tsx        # 지원 이력
│   │   └── pricing/page.tsx        # 구독 플랜
│   ├── api/                        # API Routes
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/                         # 공용 컴포넌트
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   └── Badge.tsx
│   ├── audition/
│   │   ├── AuditionCard.tsx        # 리스트 카드
│   │   ├── AuditionFilter.tsx      # 장르/마감 필터
│   │   └── ApplyButton.tsx         # 원클릭 지원 버튼
│   ├── profile/
│   │   ├── ProfileForm.tsx
│   │   └── PhotoUpload.tsx
│   └── layout/
│       ├── BottomNav.tsx           # 모바일 하단 네비
│       └── Header.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # 클라이언트 Supabase
│   │   └── server.ts               # 서버 Supabase
│   └── utils.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useProfile.ts
│   └── useApplyLimit.ts            # 지원 횟수 제한
└── types/
    └── index.ts                    # 공용 타입 정의
```

## 핵심 페이지별 구현 명세

### 홈 - 오디션 리스트 (`/`)
- 오디션 카드 리스트 (무한 스크롤 또는 페이지네이션)
- 장르 필터 탭: 전체 / 배우 / 모델
- 마감일 기준 정렬 (임박 순)
- 마감 D-Day 배지 표시 (D-3 이하 빨간색)
- 비로그인 상태에서도 열람 가능

### 오디션 상세 (`/audition/[id]`)
- 공고 상세 정보 노출
- **원클릭 지원 버튼** (핵심)
  - 비로그인: "지원하려면 로그인하세요" → 로그인 페이지 이동
  - 무료 유저 오늘 지원 가능: 바로 지원
  - 무료 유저 횟수 소진: 광고 시청 모달 → 광고 시청 후 지원
  - 유료 유저: 즉시 지원
  - 이미 지원한 경우: "지원 완료" 비활성화

### 프로필 등록 (`/profile`)
- 기본정보: 이름, 나이, 성별, 키, 몸무게
- 사진 업로드: 최대 5장 (Supabase Storage)
- 외부링크: 인스타그램, 유튜브, 기타
- 한 줄 소개 (최대 100자)
- 장르 선택: 배우 / 모델 / 둘 다

### 지원 이력 (`/history`)
- 지원한 오디션 목록
- 지원일 / 오디션명 / 주최사 / 마감일 표시
- 마감된 오디션 흐리게 처리

### 구독 플랜 (`/pricing`)
- 3개 플랜 카드 (무료 / 베이직 9,900원 / 프로 19,900원)
- 토스페이먼츠 결제 버튼

## PWA 설정 (next.config.js)
```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

module.exports = withPWA({
  // next config
});
```

## 디자인 시스템
- **주색상**: `#6366F1` (인디고) — 젊고 세련된 이미지
- **보조색상**: `#F59E0B` (앰버) — CTA 버튼
- **배경**: `#F8FAFC`
- **카드**: `#FFFFFF` + 그림자
- **폰트**: Pretendard (한국어 최적화)
- **모바일 최대 너비**: `max-w-md mx-auto` (앱처럼 보이도록)

## Pretendard 폰트 적용
```css
/* globals.css */
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');

body {
  font-family: 'Pretendard', -apple-system, sans-serif;
}
```

## 작업 지시 예시
```
frontend/CLAUDE.md를 참조해서:
1. Next.js 프로젝트를 초기화하고 폴더 구조를 세팅해줘
2. 오디션 리스트 홈 페이지를 먼저 만들어줘 (더미 데이터 사용)
3. 모바일 반응형으로 만들고 하단 네비게이션 포함해줘
```
