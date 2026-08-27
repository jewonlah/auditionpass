# 33. 운영자(사용자) 투두 리스트

> 2026-08-21 작성 · 2026-08-27 갱신(완료분 소거). 에이전트가 대신 못 하는 **결정·결제·키 발급·물리 작업**만 모았다. 완료 시 체크. 근거 문서 번호 병기.
> 우선순위: P0 = 지금 막혀 있음 · P1 = 이번 주 · P2 = 결정만 해주면 에이전트가 진행 · P3 = 나중

## P0 — 지금 막혀 있는 것

- [ ] **Anthropic API 크레딧 충전** — console.anthropic.com → Plans & Billing. CI에서 Claude 정제 전부 실패 중(32 §0-2). 분류 3단계·LLM 추출기·정제 전부 의존. 월 $5~10면 충분.
- [x] ~~**크롤러 실행 위치 결정**~~ — **① 이 PC 작업 스케줄러로 확정·등록 완료**(2026-08-22). `AuditionPass Crawler`·`AuditionPass Social` 2종 Ready.
- [x] ~~**008_crawl_logs 라이브 적용**~~ — **적용 완료**(2026-08-26 실측, `crawl_logs.details` 존재 확인).

## P1 — 이번 주 (각 5분, 키는 `crawler/.env`에만)

- [ ] **카카오 개발자 앱** — developers.kakao.com → 내 애플리케이션 → 추가 → 앱 키의 **REST API 키** → `.env`에 `KAKAO_REST_API_KEY=` (다음 카페·블로그 검색, 사업자 불필요)
- [ ] **고용24 Open API 키** — work24.go.kr → 고객센터 → OPEN API → 인증키 신청(채용정보) → `.env`에 `WORK24_API_KEY=` (아나운서·쇼호스트·MC·모델 채용, 연락처 원문)
- [ ] **YouTube Data API 키** — console.cloud.google.com → API 라이브러리 → YouTube Data API v3 사용 → 사용자 인증 정보 → API 키 → `.env`에 `YOUTUBE_API_KEY=`
- [x] ~~**Phase 1 배포 결정**~~ — `renewal/r1` → main 병합·배포 완료. 어드민 R1까지 라이브 반영됨(`013`~`017`).
- [x] ~~**`009b` 라이브 실행**~~ — **적용 완료(2026-08-27)**. `supabase db push --linked`로 실행, `daily_apply_count` 테이블·`can_apply_today`/`increment_apply_count` 함수 삭제 실측 확인. 실행 전 daily_apply_count 2행 백업함. **009 전체 완료.**
- [ ] **SERVICE_ROLE_KEY 로테이션** (30 §2 0-5) — Supabase 대시보드 → Settings → API → 재발급 → Vercel env·GitHub Secret·`crawler/.env` 3곳 교체.

## P2 — 결정만 해주면 에이전트가 진행

- [ ] **카페 본문 JSON(비공식) 보강** 사용 여부 — 공개 카페 전문·게시일 확보(마감 24%→↑). 리스크 🟠(32 §1-C). 예/아니오.
- [ ] **경쟁 애그리게이터**(캐스팅찾고·Audee·쇼스타) 수집 범위 — 제외 / 링크 인덱스만. 추천: 제외(잡코리아 판례, 32 §3).
- [ ] **인스타 D4 개정** 여부 (31 §7-1). 개정 시 경로: B-2 Claude in Chrome(무료) 먼저 → 수치 보고 B-1 Apify($5~49).
- [ ] **X API 예산** 월 $30~75 승인 여부.
- [ ] **수집 빈도** 일 1회 → 2회(03:00·12:00) 승인.
- ~~필메코·플필·OTR 제휴 피드 요청 메일~~ — **폐기(2026-08-22 사용자 결정: 해줄 이유 없음)**
- [ ] **SNS 부계정 로그인 1회**: `powershell -ExecutionPolicy Bypass -File crawler\run_social.ps1 -Login` → 창 3개(인스타·스레드·X)에서 로그인 → 터미널 Enter. 스레드는 로그인 없이도 검색이 읽히므로 먼저 돌아감. 스케줄러 "AuditionPass Social" 13:00 등록됨.

## P3 — 나중

- [ ] 상시 러너 하드웨어(미니 PC/라즈베리파이, ₩10~15만) — PC 상시 전원이 부담될 때
- [ ] 사업자등록 → 카카오 로그인 등 비즈 채널(메모리: no-kakao-login)
- [ ] `cast@auditionpass.co.kr` 수신함 개설(Resend/Google Workspace) → 뉴스레터 구독 → 메일 파싱(32 §1-D)
- [ ] Windows PC 이름 영문으로 변경(Vercel CLI 버그 근본 해결, 메모리: vercel-cli-hostname-bug)

---

## 실행 위치 — "데이터센터 차단 우회"가 아니라 "가정용 IP에서 실행" (쉽고 안전한 순)

> 2026-08-21 실측: 필메코 403·캐스트링크 Vercel Security Checkpoint는 **GitHub Actions·Jina Reader 등 데이터센터 IP에서만** 발생. 이 PC(SK브로드밴드)에선 200. VPN·스텔스 플러그인은 해법이 아님(아래 참조).

| 순위 | 방법 | 설치 | 비용 | 안전성 | PC 상시 전원 | 비고 |
|---|---|---|---|---|---|---|
| **1** | **Windows 작업 스케줄러로 로컬 실행** — `crawler/run_local.ps1`을 하루 2회 실행(절전 해제 옵션) | 10분 | 0 | 🟢 정상 이용자와 동일 | 실행 시각에만 켜져 있으면 됨 | GitHub 불필요. 로그는 로컬 파일 + Supabase crawl_logs. **가장 쉬움** |
| **2** | **GitHub self-hosted runner(이 PC, 서비스 등록)** — `runs-on: self-hosted`로 크롤 job만 분리 | 30분 | 0 | 🟢 | 예 (서비스로 자동 시작) | CI 로그·시크릿·수동 실행 버튼 유지. GitHub 공식 기능 |
| **3** | **Tailscale exit node(집 기기) + GitHub-hosted runner** — `tailscale/github-action@v3 --exit-node` | 40분 | 0 (개인 플랜) | 🟢 | exit node 기기(이 PC·라즈베리파이·Apple TV) | 러너는 클라우드, 출구만 집. 공식 문서화된 패턴 |
| **4** | **미니 PC/라즈베리파이 상시 러너**(1 또는 2를 그 기기에) | 반나절 | ₩10~15만 1회 | 🟢 | 기기가 대신 켜짐 | 가장 견고. 장기 권장 |
| **5** | **주거용 프록시 pay-as-you-go** — DataImpulse $1/GB, IPRoyal $1.75/GB, Decodo $4/GB. CI에 `HTTPS_PROXY` 1줄 | 15분 | 월 $2~6 (일 ~50MB) | 🟡 약관 회색·IP 품질 편차 | 불필요 | 집 PC를 못 켤 때의 차선 |
| 6 | 스크래핑 API(ScraperAPI 무료 1,000건/월, ScrapingBee, Zyte) | 20분 | 0~ | 🟡 | 불필요 | 주거용 라우팅은 크레딧 5~10배 소모 → 무료 한도로 부족 |
| 7 | 한국 VPS(Vultr 서울·Oracle 춘천 무료 티어) | 1시간 | 0~$5 | 🟡 차단 여부 미검증 | 불필요 | 데이터센터 대역이라 막힐 수 있음. 테스트 후 판단 |
| 8 | VPN CLI(Mullvad·Proton·Nord) | 20분 | 월 $5 | 🔴 | 불필요 | VPN 대역은 봇 차단 목록에 흔히 포함, 사업적 이용 약관 충돌 → **비추천** |
| 9 | 스텔스 플러그인(puppeteer-extra-stealth, curl_cffi 등) / npm·pip 크롤링 프레임워크(crawlee 등) | — | 0 | 🔴 | — | 우리 문제는 **IP**지 브라우저 지문이 아님. 지문 위장은 효과 없고 "차단 회피" 성격만 강해짐 → **불채택** |

**결론**: 1번(작업 스케줄러)으로 오늘 시작 → 안정되면 2번(self-hosted runner) 또는 4번(미니 PC)으로 승격. 5번은 집 PC를 못 켜는 기간의 보조.
**선을 지키는 규칙**(32 §3): 일반 브라우저 UA·요청 간격 1~2초·요약+출처+원문링크·로그인 벽 미접근·사이트의 명시적 수집 금지 의사 표시 시 중단.
