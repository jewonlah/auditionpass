# 자료 첨부·유입 기반·크롤링 상태 — 2026-09-13

## 이번 릴리스

- 앞선 029·030 운영 DB에 대응하는 포트폴리오·PDF 미리보기·자료 보관함 코드를 배포한다.
- 지원 확인에서 보관 파일 최대 3개 선택. 서버가 소유권·실제 크기를 확인해 파일 바이트를 읽고 기본 profile.pdf와 함께 첨부한다. 발송 재시도는 기존 delivery job에 저장된 같은 첨부 내용과 멱등 키를 재사용한다. 삭제되거나 읽을 수 없는 자료는 외부 발송 전에 중단한다.
- 실제 수신자에게 테스트 메일을 보내지 않았다. 선택 요청·첨부 바이트·재시도 동작은 모의 환경에서 검증했다.
- 공개 `/start`에 분야별 공고 14개 진입, 포트폴리오 준비, 지원 안내를 연결했다. 랜딩 푸터·사이트맵에 추가했으며 최초 유입 UTM 저장을 브라우저에서 확인했다.
- 개인 `/portfolio`를 robots 차단 목록에 추가. 마감·비활성·검수 대기 공고는 noindex. 확인되지 않은 고용형태·근무지·모집사를 일괄 단정하던 JobPosting은 사실 기반 WebPage 구조화 데이터로 변경했다. Google Jobs 특수 노출은 정확한 채용 원문 필드가 마련된 후 별도로 구현한다.
- GitHub 크롤링을 core/cafe/web/backtrace로 나누고 동시에 최대 2개, 그룹별 60분 상한을 둔다. 기존 로컬 all-source 실행은 유지한다. 실제 클라우드 완주 여부는 변경 후 Actions 실행에서 확인해야 한다.
- 채널 작업은 게시 초안 생성과 14일 artifact 보관으로 명확히 구분했다. 미등록 SNS 인증은 경고와 작업 요약에 표시한다. 새 계정 등록·SNS 게시·홍보 메일 발송은 하지 않았다.

## 현재 운영 실측

검증: 프론트 단위 검사 138개·브라우저 검사 14개·크롤러 그룹 분리 검사 1개 통과. 워크플로 YAML 검사와 운영 빌드(정적 페이지 70개 생성) 통과. 첫 빌드는 손상된 `.next/dev/types` 자동 생성 파일 때문에 실패해 해당 생성 파일 두 개만 제거하고 재빌드했다.

Supabase SELECT와 GitHub Actions, 이 PC의 예약 작업을 확인했다. 아래는 점검 시점 값이며 실시간 수치는 변한다.

| 항목 | 결과 |
|---|---|
| 전체 공고 | 10,339 |
| 활성 공고 | 5,784 |
| 활성·이메일 지원 공고 | 1,026 (약 17.7%) |
| 지난 24시간 갱신된 공고 | 4,436, 신규 생성 수가 아님 |
| 지난 24시간 crawl_logs 신규 저장 합 | 94, 수집 실행 중복 표본과 구분 |
| 활성인데 마감 지난 공고 | 0 |
| AI 분류 기록 | 지난 24시간 0 |
| 로컬 Crawler | 09:00·19:00 예약, 9/13 09:00 실행 종료 코드 0, 다음 19:00 |
| 로컬 Social | 13:00 예약, 9/13 13:00 실행 종료 코드 0. SNS에서 공고를 읽는 수집 작업이며 홍보 게시가 아님 |
| GitHub 크롤러 | 최근 2회 약 30분 후 취소. 네이버 검색 결과 중복 처리 중 중단된 로그 확인 |
| GitHub SNS 작업 | 성공 표시지만 Instagram·Threads 토큰 미등록으로 실제 게시 각각 0 |

로컬 일반 크롤러는 9/13 로그에서 수집 6,074건·신규 저장 16건·만료 처리 167건, 후속 인테이크 처리 30건을 기록했다. 이 PC의 로그는 Python UTF-8 출력을 PowerShell이 다시 읽는 과정에서 한글이 깨져 있어 숫자와 DB 기록을 교차 확인했다. 공식페이지·국립극단·네이버블로그·메가폰코리아·역추적은 최근 신규 저장 0건 경보가 있었으며, 저장 0건만으로 수집기 고장을 단정하지 않는다.

기존 로컬 Social은 Instagram 세션 수집을 포함한다. 저장소 D4의 Instagram 수집 금지 방침과 현재 예약 작업이 불일치한다. 이번에는 이를 실행하거나 확대하지 않았고, 계속 운영할지 별도 정리가 필요하다.

AI: 프로필 자기소개 초안과 긴 공고 정제 코드가 있으나, 전체 포트폴리오 생성·합격 확률 예측은 구현돼 있지 않다. GitHub Secrets에 DEEPSEEK_API_KEY가 없어 Actions AI 정제는 활성 동작을 확인하지 못했다. 프론트 운영 AI 키와 실제 AI 응답은 이번 공개 점검으로 검증하지 못했다.

## 검색 노출 확인

- 운영 `/`, `/auditions`, `/auditions/actor`, `/robots.txt`, `/sitemap.xml` 모두 HTTP 200.
- 사이트맵 URL 5,732개, 대표 주소는 www. Google·네이버 소유확인 태그와 GA4 로더 존재. 태그 존재는 Search Console 승인/성과 집계 완료의 증거는 아니다.
- 웹 검색에서 오디션패스 공고 상세 일부가 실제 결과로 확인됨. “오디션패스” 브랜드 검색은 동명 게임 기능과 혼재한다. 표본 검색만으로 전체 색인 수·순위·CTR·AI 채택률을 산출할 수 없다.
- AI 검색봇 접근은 허용됨. 접근 가능성과 실제 인용은 다르다. Google Search Console·네이버 Search Advisor·GA4 계정별 보고서의 노출/클릭/가입/지원 전환을 함께 봐야 한다.
- 기존 결과에 제목·본문 품질이 낮은 공고도 있었다. 유입 확대 전에 검수 큐의 비오디션·중복·본문 없는 항목 정리가 필요하다. 이번에 운영 공고를 일괄 삭제하지 않았다.

근거: [Google AI 검색 안내](https://developers.google.com/search/docs/appearance/ai-features), [Google JobPosting 규칙](https://developers.google.com/search/docs/appearance/structured-data/job-posting), [최근 크롤링 취소 기록](https://github.com/jewonlah/auditionpass/actions/runs/34717058106), [SNS 생성 작업 기록](https://github.com/jewonlah/auditionpass/actions/runs/34733302814).

## 바로 사용할 유입 링크와 초안

| 채널 | 프로필/본문에 넣을 링크 |
|---|---|
| Instagram | https://www.auditionpass.co.kr/start?utm_source=instagram&utm_medium=social&utm_campaign=launch |
| Threads | https://www.auditionpass.co.kr/start?utm_source=threads&utm_medium=social&utm_campaign=launch |
| 네이버 블로그 | https://www.auditionpass.co.kr/start?utm_source=naver_blog&utm_medium=content&utm_campaign=launch |

프로필 소개 초안: “배우·모델·아이돌 오디션 찾기부터 프로필 PDF와 이메일 지원까지. 내 분야의 공고를 확인하고 지원 자료를 준비하세요.”

첫 게시물 초안: “오디션마다 사진과 프로필을 다시 찾고 있나요? 오디션패스에서 내 분야의 공고를 보고, 프로필 PDF와 지원 자료를 한곳에 준비해 보세요. 이메일 지원 공고에서는 보관 파일도 선택해 함께 보낼 수 있어요. 공고마다 제출 양식과 마감일은 꼭 확인해 주세요.”

네이버 글 기획: ① 배우 오디션 프로필에 넣을 정보 ② 오디션 이메일 보내기 전 파일 확인 ③ 자기소개 영상 링크 접근 권한 확인. 각 글은 구체적 체크리스트와 관련 분야 공고 링크로 연결하며, 모집처 제휴·합격 보장을 주장하지 않는다.

SNS 계정명·게시 권한이 확인되면 프로필 링크 등록과 초안 발행을 연결할 수 있다. 계정 인증 토큰을 채팅에 붙여넣지 않는다.
