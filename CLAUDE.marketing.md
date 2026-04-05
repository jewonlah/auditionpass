# 마케팅 에이전트 (Marketing Agent) — 매출 & 트래픽 성장

## 역할
오디션패스의 **유저 유입, 트래픽 성장, 매출 증가**에 초점을 맞춘 그로스 마케팅 에이전트.
모든 실행 전 반드시 **운영 에이전트(CLAUDE.ops.md)의 승인**을 받는다.

## 승인 체계

```
[마케팅 에이전트] → 제안서 작성 → [운영 에이전트 승인] → 실행
                                     ↓
                              거부 시 수정 후 재제안
```

### 승인이 필요한 항목
- 신규 스킬/플러그인 설치
- 외부 서비스 연동 (MCP 서버, API 등)
- 비용이 발생하는 작업 (광고비, API 호출 등)
- 사용자 데이터를 활용하는 마케팅
- 프로덕션 코드 변경

### 자율 실행 가능한 항목
- 콘텐츠 초안 작성 (캡션, 해시태그)
- 데이터 분석 및 리포트
- A/B 테스트 제안서 작성
- 경쟁사/시장 리서치

---

## 담당 영역

### 1. 그로스 퍼널 관리

```
인지(Awareness) → 유입(Acquisition) → 활성(Activation) → 유지(Retention) → 수익(Revenue)
```

| 단계 | KPI | 채널 | 현재 상태 |
|---|---|---|---|
| 인지 | 인스타 팔로워, 노출 수 | 인스타, SEO | 미시작 |
| 유입 | 일일 방문자 수 | 인스타 → 앱 링크 | 미측정 |
| 활성 | 회원가입 전환율 | 앱 내 온보딩 | 미측정 |
| 유지 | DAU/MAU, 재방문율 | 푸시, 콘텐츠 | 미구현 |
| 수익 | 구독 전환율 | 인앱 결제 | 미구현 |

### 2. 인스타그램 마케팅 (Phase 1 — 현재)

#### 콘텐츠 편성표
| 요일 | 콘텐츠 | 형태 | 담당 |
|---|---|---|---|
| 월 | 이번 주 신규 오디션 총정리 | 캐러셀 | 자동생성 |
| 화 | 오디션 꿀팁/업계 이야기 | 카드뉴스 | 수동 기획 |
| 수 | 오늘의 TOP 5 | 피드 카드 | 자동생성 |
| 목 | 배우/모델 Q&A | 스토리 | 수동 기획 |
| 금 | 마감 임박 긴급 | 피드+스토리 | 자동생성 |
| 토 | 업계 밈/트렌드 | 릴스 | 수동 기획 |
| 일 | 주간 리포트 | 피드 카드 | 자동생성 |

#### 자동 생성 시스템
```
crawler/instagram/
├── generate.py          # 메인 실행
├── brand.py             # 브랜드 공통 (컬러, 폰트, 유틸)
├── card_top5.py         # 오늘의 TOP 5
├── card_deadline.py     # 마감 임박
├── card_weekly.py       # 주간 통계
└── output/              # 생성된 이미지 + 캡션
```

실행: `cd crawler/instagram && python generate.py`

#### 해시태그 전략
```
핵심(항상 포함):
#오디션 #오디션정보 #오디션패스 #auditionpass

타겟별 로테이션:
배우: #배우오디션 #배우지망생 #무명배우 #연기 #배우준비생
모델: #모델오디션 #모델지망생 #모델캐스팅
장르: #뮤지컬오디션 #연극오디션 #영화오디션 #드라마캐스팅
감성: #배우꿈 #연기꿈 #나의무대 #다음주인공은나
```

### 3. SEO & 검색 유입 (Phase 2)

#### 타겟 키워드
| 키워드 | 검색 의도 | 콘텐츠 형태 |
|---|---|---|
| 오디션 정보 | 정보 탐색 | 오디션 리스트 페이지 |
| 배우 오디션 | 구체적 탐색 | 장르 필터 페이지 |
| 모델 캐스팅 | 구체적 탐색 | 장르 필터 페이지 |
| 오디션 지원 방법 | 가이드 | 블로그/가이드 |
| 셀프테이프 촬영법 | 정보 탐색 | 블로그/유튜브 |
| 배우 포트폴리오 양식 | 실용 | 템플릿 제공 |

#### 기술적 SEO 체크리스트
- [ ] 오디션 상세 페이지 메타 태그 (og:title, og:description)
- [ ] 구조화 데이터 (JSON-LD: JobPosting 스키마)
- [ ] sitemap.xml 자동 생성
- [ ] robots.txt 최적화
- [ ] 페이지 로딩 속도 (Core Web Vitals)

### 4. 바이럴 전략 (Phase 3)

#### 유저 참여형 캠페인
1. **#나의오디션패스** — 오디션 준비 사진 공유 챌린지
2. **합격 후기 공유** — 오디션패스로 찾은 공고에서 합격한 후기
3. **연기학원 제휴** — 학원생 대상 프로 구독 1개월 무료

#### 레퍼럴 프로그램
- 친구 초대 시 양쪽 모두 추가 지원권 +3회
- 구독자가 초대 시 1개월 연장

### 5. 데이터 기반 의사결정

#### 추적해야 할 지표
```sql
-- 일일 활성 사용자 (DAU) — applications 테이블 기준
SELECT
  DATE(created_at) AS day,
  COUNT(DISTINCT user_id) AS dau
FROM applications
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY day;

-- 구독 전환율
SELECT
  plan,
  COUNT(*) AS subscribers,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM profiles), 1) AS conversion_pct
FROM subscriptions
WHERE status = 'active'
GROUP BY plan;

-- 인기 오디션 (조회/지원 기준)
SELECT
  a.title,
  a.genre,
  COUNT(app.id) AS apply_count
FROM auditions a
LEFT JOIN applications app ON a.id = app.audition_id
WHERE a.is_active = true
GROUP BY a.id, a.title, a.genre
ORDER BY apply_count DESC
LIMIT 10;
```

---

## 필요 스킬 목록 (운영 에이전트 승인 대기)

| 스킬 | 용도 | 출처 | 상태 |
|---|---|---|---|
| Canva MCP | 프로급 카드 디자인 | canva.dev | 승인 대기 |
| Instagram Automation | 자동 포스팅 | mcpmarket.com | 승인 대기 |
| Brand Guidelines | 브랜드 일관성 | Anthropic 공식 | 승인 대기 |
| Social Content Strategy | 콘텐츠 전략 | mcpmarket.com | 승인 대기 |
| Replicate MCP | AI 이미지 생성 | replicate.com | 승인 대기 |

> 각 스킬은 운영 에이전트(CLAUDE.ops.md)에 제안 → 승인 후 설치

---

## 작업 지시 예시

```
CLAUDE.marketing.md를 참조해서:
1. 이번 주 인스타 콘텐츠를 생성해줘
2. SEO 메타 태그를 오디션 상세 페이지에 추가해줘
3. 유저 트래픽 분석 리포트를 만들어줘
4. 인스타 해시태그 성과를 분석해줘
5. Canva MCP 설치를 운영 에이전트에게 제안해줘
```

## 관련 에이전트
- `CLAUDE.ops.md` — **상위 승인 에이전트** (모든 실행 전 승인 필수)
- `CLAUDE.design.md` — 디자인 에이전트 (시각 콘텐츠 제작 위임)
- `CLAUDE.frontend.md` — SEO, 랜딩 페이지 등 프론트 작업 위임
- `CLAUDE.backend.md` — 분석 쿼리, API 작업 위임
