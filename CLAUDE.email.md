# 메일 발송 에이전트 — Resend + @react-email

> 2026-08-18 재작성 (`CLAUDE.eamil.md` 오타 파일명 교체). 정본: `11_prd.md` F5(지원 메일), `00_decision-brief.md` D1-3(전달물 품질)·D3(지원자 보드). 현행 코드: `frontend/src/lib/email/`.

## 역할
원클릭 지원 시 캐스팅 담당자에게 발송되는 **지원 메일**의 템플릿·발송 로직. 메일이 곧 서비스의 전달물이므로 "업계 표준 포맷의 격"(D1-3)을 지향한다.

## 파일
```
frontend/src/lib/email/
├── resend.ts                   Resend 클라이언트, FROM_EMAIL(noreply@auditionpass.co.kr)
├── sendApplicationEmail.ts     발송 함수 — 서명 URL 변환, 나이 라벨, 제목 조립
└── templates/application.tsx   @react-email/components 템플릿
```

## 현행 발송 로직 (`sendApplicationEmail({audition, profile})`)
1. `audition.apply_email` 없으면 throw (외부 지원형은 호출 자체 금지 — API에서 선차단)
2. **나이 라벨**: `birth_year` 우선 → `"만 22세 (2004년생)"`, 구 데이터는 `age` 폴백 `"27세"`
3. **사진**: `photo_urls`(Storage `profiles` 버킷 공개 URL)를 **7일 서명 URL**로 변환 → 템플릿에 인라인 `<Img>` 임베드
4. **제목**: `[오디션 지원] {이름} ({성별}/{나이라벨}/{첫 분야})` — 담당자가 받은편지함에서 스캔 가능하도록
5. `resend.emails.send({ from:'오디션패스 <FROM_EMAIL>', to: apply_email, subject, html })` → 실패 시 throw

## 템플릿 필드 (`ApplicationEmailProps`)
이름 · 나이라벨 · 성별 · 키 · 몸무게 · 한줄소개 · **전화번호** · **소속사** · **특기[]** · **경력** · 인스타/유튜브/기타 링크 · 사진[]
- 없는 값은 행 자체를 숨김. 이모지·그라데이션 금지, 인디고는 헤딩 1회만.
- 하단 고지: "본 메일은 오디션패스를 통해 자동 발송되었습니다 · 문의 support@auditionpass.co.kr"

## 예정
| 시기 | 항목 |
|---|---|
| R1.1 F6 | 발송 실패 시 `applications.status='failed'` 기록 (API 연동), 재시도 UX |
| R1.2 | Resend open-tracking webhook → `applications.opened_at` (**유저 비노출**, D2) |
| R2 D3 | 메일 본문에 **지원자 보드 링크** `/board/[token]` (CD가 웹에서 지원자·컴프카드 열람) |
| R2 D1-3 | 컴프카드 PDF 첨부(또는 링크) |
| 상시 | `apply_email` 보유율 지표(D4) — 메일 발송 가능 공고 비율 |

## 발송 신뢰성 규칙
- 도메인 인증(SPF/DKIM/DMARC) 유지, `from`은 반드시 `auditionpass.co.kr`
- 지원 횟수 제한은 폐지됐으므로 스팸 방어는 **중복 지원 차단(unique) + 비노출 rate limit + 발송 실패율 모니터링**으로
- 수신자 이메일은 크롤러 `extract_email` 품질에 의존 — 사이트 푸터 메일 오수집 리스크(30 §1.1 #4). Phase 2-2에서 소스 도메인 제외·본문 구간 한정으로 상향
- 테스트 발송은 반드시 본인 주소로, 실제 `apply_email`로 테스트 금지

## 작업 지시 예시
```
CLAUDE.email.md를 참조해서:
1. 발송 실패를 throw 대신 {ok:false, reason}으로 반환하고 /api/apply가 status:'failed'로 기록하게 해줘
2. 템플릿 하단에 지원자 보드 링크 슬롯을 추가해줘 (boardUrl optional, R2 대비)
```
