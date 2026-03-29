# 오디션패스 (AuditionPass) — 총괄 PM 에이전트

## 프로젝트 개요
한국 배우/모델 오디션 정보를 자동 수집하고, 버튼 하나로 포트폴리오를 주최자에게 자동 전송하는 원클릭 오디션 지원 플랫폼.

## 기술 스택
- **프론트엔드**: Next.js 14 (App Router) + Tailwind CSS + PWA
- **백엔드**: Next.js API Routes
- **DB/Auth**: Supabase
- **메일 발송**: Resend
- **결제**: 토스페이먼츠
- **광고**: Google AdSense (리워드)
- **크롤러**: Python (Playwright + BeautifulSoup)
- **배포**: Vercel (앱) + GitHub Actions Cron (크롤러)

## 프로젝트 구조
```
auditionpass/
├── CLAUDE.md                  # 총괄 PM 에이전트 (현재 파일)
├── frontend/
│   ├── CLAUDE.md              # 프론트엔드 에이전트
│   └── (Next.js 프로젝트)
├── crawler/
│   ├── CLAUDE.md              # 크롤러 에이전트
│   └── (Python 크롤러)
├── database/
│   ├── CLAUDE.md              # DB 에이전트
│   └── (스키마 + 마이그레이션)
├── backend/
│   └── CLAUDE.md              # 백엔드 API 에이전트
└── email/
    └── CLAUDE.md              # 메일 발송 에이전트
```

## 개발 우선순위 (MVP 기준)

### Phase 1 — 핵심 플로우 (런칭 필수)
- [ ] DB 스키마 생성 (`database/` 에이전트)
- [ ] Next.js 프로젝트 초기화 + PWA 세팅 (`frontend/` 에이전트)
- [ ] 회원가입 / 로그인 이메일 인증 (`frontend/` + `backend/` 에이전트)
- [ ] 프로필 등록 / 수정 페이지 (`frontend/` 에이전트)
- [ ] 오디션 리스트 + 상세 페이지 (`frontend/` 에이전트)
- [ ] 원클릭 지원 버튼 + 이메일 발송 (`backend/` + `email/` 에이전트)

### Phase 2 — 수익화
- [ ] 하루 1회 지원 횟수 제한 로직 (`backend/` 에이전트)
- [ ] 광고 시청 → 추가 지원권 로직 (`frontend/` + `backend/` 에이전트)
- [ ] 구독 결제 토스페이먼츠 연동 (`backend/` 에이전트)
- [ ] 지원 이력 대시보드 (`frontend/` 에이전트)

### Phase 3 — 고도화
- [ ] 크롤러 스크립트 완성 (`crawler/` 에이전트)
- [ ] GitHub Actions Cron 세팅 (`crawler/` 에이전트)
- [ ] PWA 푸시 알림 (`frontend/` 에이전트)
- [ ] 프로 플랜 상단 노출 로직 (`backend/` 에이전트)

## 코딩 원칙
- TypeScript 사용 필수 (any 타입 금지)
- 컴포넌트 단위 분리 (재사용 가능한 구조)
- 환경 변수는 반드시 `.env.local` 사용, 하드코딩 금지
- 에러 핸들링 필수 (try/catch + 사용자 친화적 에러 메시지)
- 모바일 퍼스트 반응형 (Tailwind breakpoint: `md:` 이상 데스크탑)
- 커밋 메시지: `feat:`, `fix:`, `refactor:`, `chore:` 형식

## 환경 변수 목록
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@auditionpass.co.kr

# 토스페이먼츠
TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=

# Google AdSense
NEXT_PUBLIC_ADSENSE_CLIENT_ID=
```

## 작업 지시 방법
각 도메인별 작업 시 해당 서브 에이전트 CLAUDE.md를 참조하도록 지시.
예: "database/CLAUDE.md를 참조해서 스키마를 생성해줘"
