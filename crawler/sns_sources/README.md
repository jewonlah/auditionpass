# sns_sources — SNS·검색형 오디션 소싱 (트랙 A·B)

> 근거: `docs/renewal/31_sns-sourcing-plan.md`, 플랜(2026-08-22) `34_data-fill-plan.md`. 어느 채널이든 산출물은 사이트 크롤러와 동일한 `AuditionData` → 기존 `upsert_auditions` 재사용(카테고리·품질 점수·검수 큐는 거기서).

## 모듈 지도 (2026-08-22)
| 모듈 | 채널 | 실행 | 게재 |
|---|---|---|---|
| `naver_cafe.py` | 네이버 카페 검색(API HUB) 78 키워드 | main.py (`NAVER_CAFE_ENABLED=1`) | 신뢰 카페 auto, 신규 카페 pending |
| `naver_web.py` | 네이버 블로그·웹문서(API HUB) | main.py | **출처 단위 검수**: trusted만 저장, 나머지는 `source_candidates`(도메인/블로거) |
| `session_browser.py` | 인스타·스레드·X — Playwright persistent profile(`crawler/.browser/`) | `run_social.ps1` 13:00 / `-Login` 1회 | 계정별 trusted, 신규 계정 pending. **스레드는 로그인 없이 검색 가능(실측)** |
| `backtrace.py` | 애그리게이터 제목 → 네이버 검색으로 원글 역추적 | main.py | 원글만 저장(애그리게이터 텍스트 저장 X) |
| `exclude_domains.py` | 저장 금지 도메인 정본 | — | — |
| `instagram_caption.py` | 캡션 파서(3플랫폼 공용) | — | — |
| `../scrapers/generic_board.py` | 콘테스트코리아·국립극단·이벤트넷·플레이DB (설정형) | main.py | pending → `tools/review.py approve-source` |
| `../scrapers/official_pages.py` | 기획사·공공 공식 페이지 변경 감시(해시) | main.py | pending |
검수: `python -m tools.review list | approve | reject | approve-source | trust | candidates | candidate-approve`

## 트랙 A-1. 네이버 카페 (`naver_cafe.py`) — 공식 API, 운용 중(게이트)
- NAVER API HUB `GET /search/v1/cafearticle`, 헤더 `X-NCP-APIGW-API-KEY-ID/KEY`. env `NAVER_API_HUB_CLIENT_ID/SECRET`.
- `NaverCafeScraper`는 `BaseScraper` 구현 → `main.py`가 **`NAVER_CAFE_ENABLED=1`일 때만** 파이프라인에 추가(검수 전 라이브 오염 방지).
- 키워드 ~80개(14카테고리 전체: 배우·엑스트라·모델·키즈·MC/쇼호스트/아나운서·가수·아이돌·성우·댄서·인플루언서·BJ/스트리머) × 최신 100건. 필터 순서: 카페 블랙리스트(맘카페·창업·부동산·중고) → 제목 '소식·정리·후기' 제외(`_NEWS_TITLE`) → 사기 광고(`_SCAM`) → 신호어(강신호 `_CAFE_SIGNALS` 또는 역할어 `_ROLE`+모집동사 `_RECRUIT`) → 본문 제외어(`_NEGATIVE`, 시술·실습모델·수강·레슨·오케스트라) → 요약 20자 미만 제외.
- dry-run(DB 저장 없음): `python -m sns_sources.naver_cafe [샘플수]` — 키워드별 통과율과 ⚠(30% 미만) 제외 사유를 출력. 2026-08-21 실측 6,120→4,871 통과(80%), 이메일 0.3%, 마감 추출 24%.
- 카페명 블랙리스트는 넓게 잡지 말 것(‘나눔’이 "정보나눔카페"를 막은 전례). 노이즈는 본문 제외어로.
- 마감 미상 공고는 `deactivate_stale_undated(30)`으로 수집 30일 후 비활성화. 마감일은 위조하지 않는다.

## 트랙 B. 인스타그램 — **D4 개정 확정 후 운용**
> 수집 채널(캡션을 어떻게 가져오나)과 파싱(`instagram_caption.py`)을 분리했다.

## 2026-08-21 실측 결론
- 인스타 **공개 게시물 캡션·이미지·계정 최근글·키워드 검색은 브라우저 세션에서 전부 읽힘**.
- **서버 무로그인 `curl`은 429/302/500 전부 차단** → 자동화는 "로그인된 브라우저"를 흉내내야 함.

## 채널 3경로

### B-2. Claude in Chrome (즉시·무료·소량) — 지금 가능
운영자가 이 세션에서 지시:
1. 계정 화이트리스트(예: `a_pointcompany_official` 등 캐스팅 전문 계정)를 순회
2. 각 프로필 `/{user}/`에서 최근 게시물 shortcode 수집 → 각 `/p/{shortcode}/` 캡션 추출
3. 추출한 `(shortcode, username, caption, posted_at)`를 `IGPost`로 만들어 `parse_many()` 호출
4. 결과 `AuditionData[]`를 `filter_expired` 후 `upsert_auditions`
- 세션 붙은 동안만·수동 트리거. **초기 계정 발굴·데이터 시딩용.**

### B-1. 관리형 API (자동 cron·유료·권장) — 확장 시
- HikerAPI(무료 티어 有)·Apify(~$1.5/1천건)·ScrapeCreators 중 택1.
- REST로 계정 최근 미디어·캡션 획득 → 동일하게 `IGPost` → `parse_many`.
- GitHub Actions cron에 통합. 계정 밴 리스크를 벤더가 흡수.
- 시크릿 추가: `HIKER_API_KEY` 또는 `APIFY_TOKEN`.

### B-3. 자체 Playwright + 세션 (비권고)
- 무료지만 계정 밴·IP 차단 리스크. 전용 부계정 필요. D4 리스크의 핵심.

## 파서 (`instagram_caption.py`)
- `is_audition_caption` — 규칙 기반 1차 필터(오디션 신호어 有 / 후기·클래스 홍보 제외). **Phase 2-1 classifier 연결 시 이 게이트를 classifier로 교체.**
- `parse_caption(IGPost) -> AuditionData | None` — 제목(신호어 줄 우선)·분야 추정·마감일(전화번호 오탐 제거, 마감 맥락 M/D 보정)·이메일/DM 구분·출처 링크.
- 마감 지난 공고·비오디션은 `None`.

## 한계·주의
- 캡션 파싱은 휴리스틱 → classifier 연결 전까지 **저품질 후보는 검수 후 게재** 권장(트랙 C 제보 검수 UI 재사용).
- `company`는 계정명(추정). 정밀 주최는 classifier/수기 보정.
- Meta ToS 리스크는 여전히 운영자 책임. B-1이 리스크 최소.
