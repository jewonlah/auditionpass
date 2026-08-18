# 전면 수정 마스터플랜 (30)

> 작성일: 2026-08-10 · 작성: 총괄 기획(Fable 5)
> 상위 기준: `00_decision-brief.md`(D1~D8) · 정본: 00 > 12 > 11 > 10
> 근거: 2026-08-10 코드베이스 전수 진단 3종 (frontend / crawler·database / 아키텍처·인프라, Opus 5 병렬 진단)
> 범위: **서비스 전체** — frontend, crawler, database, 운영 문서, 배포 파이프라인 (사용자 확정 2026-08-10)

---

## 1. 진단 종합 — 기획과 현실의 격차

### 1.1 가장 중요한 발견 (우선순위 순)

1. **라이브 서비스가 2026-04-08 상태로 4개월 동결.** origin/main 미푸시 커밋 3개(지원 메일 개편, OG 이미지, R1.1 리뉴얼 1차) + 미커밋 워킹트리(R1.1 2차, +836줄) + 미추적 파일(starlet.py, sns/, 009 마이그레이션, docs/renewal 13종). "sitemap 동결 버그"(00 D7)의 실체는 버그가 아니라 **미배포**. 작업물 전체가 로컬 단일 사본 — 유실 위험 최고.
2. **코드-DB 스키마 드리프트.** `009_renewal_apply_flow.sql`(daily_apply_count DROP, birth_year 신설)의 Supabase 적용 여부 미확인. 미적용 상태에서 워킹트리 코드를 배포하면 런타임 장애.
3. **14개 카테고리 분류기 전면 미연결.** `classifier.py`(270줄)가 dead code. DB에는 3분류(배우/모델/기타)만 저장 중. 리뉴얼의 카테고리 필터·SEO 랜딩 14개·개인화가 전부 이 데이터에 의존 — **연결 작업은 소규모, 회수는 최대**.
4. **원클릭 지원 오발송 리스크.** `extract_email()`이 페이지 전체에서 첫 이메일을 수집 → 사이트 푸터 이메일이 지원처로 저장될 수 있음. 신뢰(D1-2) 직결.
5. **CLAUDE.*.md 9종 중 4종(총괄/backend/frontend/database)이 심각하게 낡음.** 폐지된 결제·광고·지원제한이 살아 있어, 이 문서를 참조하는 에이전트는 잘못된 코드를 생성. 전면 수정을 에이전트 체제로 진행하므로 **최우선 정비 대상**.

### 1.2 frontend 판정 — 하이브리드 (전면 재구축 기각)

- 규모 7,993 LOC / 61파일. 5탭 셸·`/home`·returnTo·ApplyButton 게이트 상태머신·BottomSheet는 **이미 신규 사양(12·20 인용 주석 포함)대로 구현 완료**. 보존 대상 ≈ 80%.
- 재작성 대상 ≈ 20%(1,557줄): 디자인 토큰(현재 0% 반영) + UI킷 334줄 + 공개 4페이지 CSR→SSR 전환.
- "웹사이트 같다"의 원인은 아키텍처가 아니라 표현층: hover 65회 vs :active 5회, 폰트 74.5%가 14px 이하, `alert/confirm` 4곳, 자체 뒤로가기 4벌, 하드코딩 hex 59곳.
- 미구현: `/onboarding` 3스텝, SEO 랜딩 ×14, 찜(북마크), 구글 OAuth 버튼, 비로그인 탭 바텀시트 게이트.

### 1.3 crawler·database 판정 — 연결과 정리가 본체, 재작성은 3건

- 유지: BaseScraper 계약, casting114·castik·filmmakers(수집 기둥), 006 커뮤니티 스키마, refine_description 비용 최적화.
- 재작성: **캐스트링크**(구조적 결함 — 상세 접근 불가, apply_email 0%, 합성 URL로 중복 누적; 내부 API 탐색 실패 시 소스 제외), **메가폰·V오디션**(광역 셀렉터 스프레이 → 명시적 셀렉터).
- 수복: 인코딩 손상 6곳(+DB `캐스팅나��` 레코드 정정), 마감일 파싱(본문 첫 날짜 → 라벨 근처 우선), 중복 제거 강화.
- 신설: crawl_logs 실기록, 소스별 임계치 실패 판정, 마이그레이션 거버넌스(Supabase CLI 또는 schema_migrations).
- 결제: 재작성이 아니라 **신규 구축**(현재 구현 0%). D8에 따라 R1 범위 밖 유지, R3에서 D2 재설계 기준으로 신규 설계.

---

## 2. 실행 계획 — Phase 0~4

> 모델 운영: **기획·설계·리뷰 게이트 = Fable 5** / **구현·반복 작업 = Opus 5 에이전트**. 각 Phase 종료 시 Fable 5가 정본 문서 대비 검수 후 다음 Phase 진행.

### Phase 0 — 안전 확보 (반나절, 다른 모든 것에 선행)

| # | 작업 | 비고 |
|---|---|---|
| 0-1 | 워킹트리 논리 단위 커밋: ⓐ docs/renewal 13종 ⓑ crawler(starlet.py + main.py + sns/ + crawler.yml + requirements — **반드시 한 커밋**, 분리 시 CI ImportError) ⓒ frontend R1.1 2차 ⓓ 009 마이그레이션 | 사용자 승인 후 실행 |
| 0-2 | 백업 브랜치 `renewal/r1` 생성 → origin 푸시. **main 푸시 금지**(Vercel git 연동 추정 — main 푸시 = 4개월치 일괄 배포 + 009 미적용 시 장애) | |
| 0-3 | Supabase 009 적용 여부 실측 확인(정보 스키마 조회) → 미적용이면 적용 절차 수립 | 배포 게이트 |
| 0-4 | CLAUDE.MD.md / backend / frontend / database 4종을 docs/renewal 정본 기준 전면 재작성, CLAUDE.eamil.md → CLAUDE.email.md 교체, 폐지 개념(결제·광고·지원제한) 전부 제거 | 에이전트 오염 방지 |
| 0-5 | 보안 위생: `crawler/.env`의 SERVICE_ROLE_KEY가 OneDrive 동기화 경로에 평문 존재 — 키 로테이션 검토, megaphone `verify=False` 제거 | |

### Phase 1 — 라이브 정상화 (R1.0 핫픽스 배포, ~1주)

- 009 적용 확인(0-3) 통과 후: F10 핫픽스 10건 검증(상당수 워킹트리에 이미 반영) → main 병합·배포.
- 배포 +24h: sitemap 실측(등재 500+), F10 회귀 시나리오 확인, 계측 이벤트(PRD §7.2) 최소셋 심기.
- 효과: 4개월 누적 중인 SEO·바이럴 손실 즉시 차단(OG 이미지·지원 메일 개편도 이 시점에 라이브 반영됨).

### Phase 2 — 데이터 트랙 (crawler·DB, Phase 3과 병렬)

| 순서 | 작업 | 근거 |
|---|---|---|
| 2-1 | 분류기 연결: `SOURCE_CATEGORY_BIAS` 키를 한글 source_name으로 수정 → `classify_audition()`을 upsert 파이프라인에 연결 → category 계열 4컬럼 실저장 | 최대 ROI. SEO 랜딩 14개(3-4)의 데이터 전제 |
| 2-2 | `extract_email` 상향(castik 방식: 소스 도메인 제외 + 본문 구간 한정) + apply_email 보유율 지표화(D4) | 오발송 방어 |
| 2-3 | 인코딩 손상 6곳 수복 + DB source_name 정정, 마감일 파싱 개선(필메코 패턴 base 승격) | |
| 2-4 | crawl_logs 실기록 + 워크플로 실패 판정 "전부 실패" → 소스별 임계치, deactivate 3중 중복 → pg_cron 일원화 | 관측성 |
| 2-5 | 메가폰·V오디션 셀렉터 재작성, 캐스트링크 내부 API 탐색(실패 시 소스 제외 + 기존 중복 행 정리) | |
| 2-6 | D4 신규 소스 2종 착수: 플레이DB, 기획사 공식 페이지(검증 배지 재료) | 인스타 크롤링 금지 유지 |
| 2-7 | 마이그레이션 거버넌스 전환(Supabase CLI), profiles.phone 드리프트 소급 정리 | |

### Phase 3 — R1.1 코어 리뉴얼 (frontend 본선)

PRD §5.2 순서를 진단 결과로 보정한 실행 순서:

1. **F12 기반**: `23_design-system.md` 토큰 이식(globals.css 전체 교체) → 하드코딩 hex 59곳·shadow 15곳 치환 → UI킷 재작성(Button :active 프레스, Toast·ConfirmSheet 신설로 alert/confirm 4곳 제거, 공용 BackButton으로 뒤로가기 4벌 통합) → timeAgo·CATEGORY_COLORS·PostCard 중복 제거
2. **타이포·터치 일괄 조정**: 리스트 제목 17px, 본문 최소 15px, 터치 타깃 44px+
3. **F2 잔여**: 비로그인 홈 탭 → `/`(랜딩) 연결, 지원·MY 탭 터치 → 로그인 바텀시트(현재 proxy.ts 전체 리다이렉트 위반 수정)
4. **F4 온보딩 3스텝** 신설 + ProfileForm 2섹션 재편 + 구글 OAuth(Supabase provider 설정 → ApplyButton 버튼 활성 — `apply=1` 재오픈 로직은 준비 완료)
5. **F6 지원 탭 완성**: 찜(bookmarks — 009) 구현, MY 메뉴 정리
6. **F7+F9 단일 작업**: 공개 4페이지(auditions/audition상세/community/community상세) SSR 전환 + 메타·스키마 + 필터 2축 + 스크롤 보존 + 스켈레톤 표준화(스피너 7곳 대체)
7. **SEO 랜딩 ×14** (`/auditions/[category]`) — 2-1 분류 데이터 축적 확인 후 오픈
8. **F1 랜딩** 에디토리얼 재작성(21_landing.html 참조) + next/font self-host
9. **F8 모션 시스템** 고도화(framer-motion + template.tsx — 11 §6.3 초안 채택)
10. **F11 마무리**: 미사용 의존성 4종(toss SDK·react-hook-form·zod·resolvers — RHF+zod는 폼 리팩터에 활용 여부 이 시점 결정) 및 사문 파일 정리

### Phase 4 — R1.2 / R2 (본선 배포 + KPI 게이트 통과 후)

- R1.2: 열람 추적 인프라(노출 금지 — D2), Organization/Breadcrumb 스키마, 커뮤니티 폴리시(C4/C5/C7), 모션 고도화 잔여.
- R2: 컴프카드 PDF(D1-3), 지원자 보드 `/board/[token]`(D3). 착수 조건: 노스스타 상승 + 미니 프로필 보유율 기준선.
- R3: 결제 신규 설계(D2 — 부스트·알림·프리미엄 템플릿·열람 확인. 단일 플랜 기준 payments/웹훅/갱신 포함 신규 스키마).

---

## 3. 의존성 맵 (크로스 트랙)

```
0-3 (009 확인) ──→ Phase 1 배포 게이트
2-1 (분류기)   ──→ 3-7 (SEO 랜딩 14) · 홈 개인화 추천 품질
2-2 (email 상향) ─→ 원클릭 신뢰 (F5는 코드 완료, 데이터가 병목)
0-4 (문서 재작성) → 모든 에이전트 작업의 전제
구글 OAuth 콘솔 설정(ops) ──→ 3-4
Resend open tracking webhook ─→ Phase 4 열람 인프라
```

## 4. 리스크

| 리스크 | 완화 |
|---|---|
| main 배포 시 4개월치 일괄 반영으로 회귀 폭발 | Phase 1에서 F10 회귀 시나리오 전수 확인 후 배포, 랜딩/앱셸 피처 플래그(11 §5.2 롤백 전략) |
| 009 DROP 마이그레이션 롤백 경로 없음 | 적용 전 대상 테이블 백업 덤프 |
| SSR 전환 중 지원 버튼 상태 회귀 | F7+F9 단일 PR + 지원 플로우 E2E 회귀(11 §6.2) |
| OneDrive 경로의 git 저장소(잠금·동기화 충돌) | 전면 수정 기간 중 `C:\Projects\auditionpass` 이전 검토(선택) |
| 스팸성 대량 지원(제한 폐지 후) | 비노출 rate limit + 중복 차단(F5) + 발송 실패율 가드레일 |

## 5. 검증 게이트 (Phase 통과 기준)

- P0→P1: 커밋·백업 완료, 009 상태 확정, CLAUDE 문서 4종 교체 완료.
- P1→P2/3: sitemap 등재 500+, F10 회귀 통과, 계측 이벤트 수신 확인.
- P3 내부: 각 단계 종료 시 Fable 5 검수 — 수용 기준(11 F1~F12 체크리스트) 대조.
- P3→P4: PRD §7.3 — 배포 +2주 퍼널 리뷰(첫 지원 ≤7단계, 게이트 이탈, 노스스타).

## 6. 모델 운영 전략 (2026-08-10 확정)

| 역할 | 모델 |
|---|---|
| 마스터플랜·아키텍처 결정·Phase 검수·정본 문서 관리 | Fable 5 |
| 구현 에이전트(frontend/crawler/DB 트랙), 컨텍스트 수집, 반복 루프 | Opus 5 |
| Mythos 5 | 사용 불가(Project Glasswing 전용) — Fable 5와 동일 모델이므로 무손실 |

---

*본 문서는 00 브리프(D1~D8)를 상위 기준으로 하며, 충돌 시 브리프가 우선한다. 실행 중 발견되는 격차는 본 문서에 추가 기록한다.*
