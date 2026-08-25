# 인테이크 에이전트 기획 (38) — 어떤 형태의 공고든 원클릭 가능한 정본으로

> 2026-08-25 · Codex 2라운드 교차검증 후 조건부 수렴(P1 3건은 v1 구현 요건으로 흡수).
> 사용자 요구: 사진·텍스트·영상·접근 불가 경로로 흩어진 오디션 정보를 한 번에 수집해 플랫폼에서 원클릭 발송 가능한 형태로 만드는 전문 에이전트.

## 0. 정체성 — 한 줄 정의

**인테이크 에이전트는 "게시 에이전트"가 아니라 "검수 후보 생성 에이전트"다.**
무엇이 오든 → 정본 스키마의 후보(pending)로 변환하는 것까지가 권한. 게시·원클릭 활성화는 운영자 액션.

## 1. 계층 구분 (LLM 사용 경계)

| 계층 | 엔진 | 트리거 | 비용 | 대상 |
|---|---|---|---|---|
| ① 크론 크롤러 | 규칙(무LLM) | 스케줄러 | 0 | 대량 정형 소스 |
| ② **인테이크 에이전트** | Claude 세션 + 규칙 CLI | 운영자/유저 온디맨드 | 구독 내 | 규칙이 못 삼키는 잔여물(이미지·비정형·비공개 전달물) |

무비용·무LLM 원칙(sourcing-pipeline 정본)은 ①에만 적용. ②는 온디맨드라 통제됨.

## 2. LLM 계약 (Codex P1 — 가장 중요한 규칙)

```
LLM은 추출·정규화·분류만 한다.
LLM은 발명하지 않는다: 빈칸 채우기·지원 방법 추론·게시 가능성 판단 금지.
```
- 모든 LLM 추출값은 **source_span(근거 스니펫, 필드당 80~160자) 필수**. 근거 없으면 missing으로 둔다.
- 이메일·날짜·전화·URL은 LLM 출력 후에도 **규칙 재검증** 통과 필수.
- 필드 상태 6종: `verified_rule / llm_extracted_with_evidence / conflicting / missing / ambiguous / rejected` + 필드별 confidence 분리.
- LLM 관여 후보는 `llm_assisted=true` — 항상 pending(자동 게시 없음).
- 원클릭 가능 판정은 LLM 금지: 구조화 검증(이메일 4조건+제출물+마감+대상+대리 발송 금지 문구 없음) 전부 통과 시에만 후보 표시, 활성화는 운영자.

## 3. v1 범위 (이번 주)

**입력**: `text`(붙여넣기) / `image`(운영자 업로드 스크린샷 — OCR 1차, 저신뢰 영역만 Claude 멀티모달) / `public_url`(단일 공개 페이지, requests→렌더 폴백, robots/로그인 벽은 즉시 거부+캡처 경로 안내).
**제외(v1.5+)**: 영상(설명란 포함), 카톡/DM 전용 타입(스크린샷으로 우회 접수만), 유저 제보 큐 자동화, 음성 인식(금지).

**권한 경계 (P1 — 코드로 강제)**:
```
에이전트 가능: parse → validate → preview → upsert(pending/quarantine만)
에이전트 불가: publish · 원클릭 활성화 · 로그인 벽 크롤 · 원문 전문 저장
게시 승격: 기존 tools/review.py approve (운영자)
```

## 4. 출처·안전 정책

- source_type: `public_url / user_submitted_screenshot / user_submitted_text / private_message_forward / official_account_dm / operator_verified`.
- 비공개 전달물(카톡·DM) = `unverified_private_source`: 기본 pending, **원클릭 불가**. 자동 격리 4규칙: 공개 출처 없음 + {금전 요구 | 미성년 대상 | 개인 계좌·오픈채팅 유도} → quarantine.
- 위험 룰(utils/risk.py — 기 구현)은 v1 필수 통과 게이트.
- 이미지·자막: 원본·전문 저장 금지, 근거 스니펫만, 임시 파일 TTL 7일. 게시 화면은 사실 필드만.
- 충돌 관리: `same_notice_confirmed / possible_duplicate / same_project_different_role / updated_notice / conflicting_notice` — 필드별 출처 우선순위(공식 사이트 > 공식 SNS > 카페 원글 > 스크린샷 > 카톡) + 최신성 축 분리.
- 감사 로그: 입력 타입·출처·파서 버전·모델명·필드별 근거·운영자 로그·게시 시점 JSON (재현 가능한 최소한만).

## 5. 운영자 검수 요약 포맷 (10초 판단)

판단값 3종 고정: `READY_TO_REVIEW / NEEDS_MORE_SOURCE / QUARANTINED` ("승인" 단어 금지 — 에이전트 권한 오해 방지).
출력 순서: 결정 → 공고 필드(상태/conf) → 원클릭(상태+차단 사유) → 리스크(점수·플래그) → 출처(타입·신뢰·dedup) → 누락/모호/충돌 → 근거 스니펫 → 다음 명령. (전체 템플릿: 스킬 문서에 내장)

## 6. 성공 지표 (수량 아님)

핵심: `intake_to_oneclick_rate`(입력→원클릭 전환), `false_publish_rate`·`false_oneclick_rate`(사고율 — 최우선 가드), `field_accuracy_by_type`, `human_correction_rate`, `time_to_review`.
가드레일: LLM 근거 없는 값 비율(0 목표), quarantine 우회율, 공개 출처 없는 공고 게시율.

## 7. v1 구현 체크리스트 (P1 3건 포함 — 이것이 수렴 조건)

- [x] 스키마: 필드 상태 6종·confidence·source_span·risk flags (`tools/ingest.py`)
- [x] text → parse/validate/preview
- [x] image → OCR 없으면 Claude 멀티모달 전사 경로(스킬 지침)
- [x] public_url 단일 페이지
- [x] upsert pending-only (신규 출처 → 기존 검수 큐 규칙에 의해 자동 pending, risk≥7 → quarantine)
- [x] 검수 요약 출력
- [x] **P1-1 권한 경계**: publish 명령 자체가 없음. 승격은 tools/review.py만
- [x] **P1-2 골든셋**: `tests/golden/` 실제 공고 표본 + 필드 정확도 테스트
- [x] **P1-3 위험 룰**: utils/risk.py 게이트 통합
- [ ] v1.5: 영상 설명란 어댑터, 유저 제보 큐 연결, 출처 레지스트리 테이블, golden set 50개 확장

*구현: `crawler/tools/ingest.py` + 프로젝트 스킬 `.claude/skills/ingest/SKILL.md` (/ingest).*
