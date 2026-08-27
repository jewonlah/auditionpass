"""
네이버 카페 오디션 소싱 — 트랙 A-1 (31_sns-sourcing-plan §3)

NAVER API HUB 카페글 검색(`/search/v1/cafearticle`)을 키워드 셋으로 폴링해 오디션 공고 후보를 수집한다.
- 공식 API(D4 취지 안). 무료 월 775,000건 / 키당 50 RPS. 우리 사용량: 키워드 × 페이지 ≈ 30 call/일.
- 실측(2026-08-21): 제목·요약(description)·카페명·링크만 제공, 게시일 없음, 요약 속 이메일은 마스킹(***@gmail.com).
  → apply_email 보유율이 낮아 대부분 external 공고(원클릭 X, 커버리지·SEO용). 본문 전문은 링크 유도.
- 노이즈가 큼("배우 모집" → 반영구 시술 모델, "오디션 공고" → 창업·오케스트라) → 신호어/제외어 + 카페 블랙리스트로 1차 필터,
  카테고리는 upsert 단계의 classifier가 확정.
- 마감일은 요약에서만 추출(연-월-일 우선, 연도 없는 M/D는 마감 맥락+오늘 기준 보정). 미상이면 None — 위조하지 않는다.

환경변수: NAVER_API_HUB_CLIENT_ID / NAVER_API_HUB_CLIENT_SECRET (헤더 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY)
게이트: NAVER_CAFE_ENABLED=1 일 때만 main.py 파이프라인에 포함 (검수 전 라이브 오염 방지).
"""
from __future__ import annotations

import html
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Optional

import requests

from scrapers.base import AuditionData, BaseScraper
from utils.email_extract import extract_apply_email
from sns_sources.instagram_caption import _AUDITION_SIGNALS, _extract_deadline

logger = logging.getLogger(__name__)

ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/cafearticle"

# 키워드 셋 — 14카테고리(classifier.CATEGORIES) 전체를 덮는다. 배우뿐 아니라 엑스트라·모델·행사 MC·쇼호스트·
# 아나운서·성우·댄서·가수 등 "출연해서 수익이 나는" 모든 공고가 대상 (사용자 지시 2026-08-21).
# 넓은 키워드는 필터(_NEWS_TITLE/_CAFE_SIGNALS/_NEGATIVE)에 기대고, 좁은 키워드는 그대로 신뢰. 키워드당 1 call/일.
KEYWORDS: list[str] = [
    # 배우 — 영화·드라마·웹드라마
    "단편영화 캐스팅", "단편영화 배우 모집", "독립영화 배우 모집", "장편영화 배우 모집", "상업영화 캐스팅",
    "웹드라마 오디션", "웹드라마 배우 모집", "웹드라마 모델 모집", "숏폼 드라마 배우 모집", "드라마 보조출연",
    "뮤직비디오 출연자 모집", "광고 촬영 배우 모집", "유튜브 출연자 모집", "캐스팅 공고", "배우 오디션", "배우 모집", "출연자 모집",
    # 엑스트라·단역
    "보조출연 모집", "엑스트라 모집", "이미지 단역 모집", "단역 배우 모집",
    # 연극·뮤지컬
    "뮤지컬 오디션", "뮤지컬 배우 모집", "연극 배우 모집", "연극 오디션", "극단 단원 모집",
    # 모델·촬영모델·키즈
    "모델 모집 촬영", "피팅모델 모집", "쇼핑몰 모델 모집", "광고모델 모집", "패션쇼 모델 모집", "화보 모델 모집",
    "아역모델 모집", "아역배우 모집", "키즈모델 모집", "아동 모델 촬영", "시니어 모델 모집",
    # MC·진행자·쇼호스트·아나운서·행사
    "행사 MC 모집", "행사 진행자 모집", "이벤트 MC 모집", "쇼호스트 모집", "쇼호스트 채용", "라이브커머스 쇼호스트",
    "라이브커머스 진행자 모집", "틱톡 라이브 쇼호스트", "아나운서 모집", "아나운서 채용", "리포터 모집",
    "유튜브 진행자 모집", "사회자 모집", "행사 모델 모집",
    # 가수·트로트·아이돌
    "가수 오디션", "보컬 모집 오디션", "트로트 오디션", "아이돌 오디션", "아이돌 연습생 오디션", "연습생 모집",
    "걸그룹 멤버 모집", "보이그룹 멤버 모집", "걸그룹 오디션", "보이그룹 오디션",
    # 성우·댄서·인플루언서·BJ/스트리머
    "성우 모집", "더빙 배우 모집", "나레이션 모집", "댄서 모집", "안무 댄서 오디션", "백업댄서 모집", "BJ 댄서 모집",
    "인플루언서 모집 촬영", "크리에이터 모집 출연", "틱톡 크리에이터 모집", "틱톡커 모집", "방송 BJ 모집", "인터넷 방송 진행자 모집",
    "스트리머 모집", "유튜버 모집 출연",
    # 포괄
    "오디션 공고", "캐스팅 모집",
]
PAGES_PER_KEYWORD = 1   # display=100 × 1페이지 (sort=date). 더 깊이 긁을 필요 없음 — 매일 돈다.
DISPLAY = 100

# 제외 신호 — 실측 노이즈 유형: 뷰티 시술 모델, 스터디/수강, 창업 오디션, 음악 단원, 체험단, 후기
_NEGATIVE = re.compile(
    # 뷰티 시술 실습 모델 (화장품·두피케어 '광고 촬영 배우 모집'은 정상 수익 건이라 '피부|두피' 단독은 쓰지 않는다)
    r"반영구|문신|시술|속눈썹\s*(?:펌|연장)|헤어라인|눈썹\s*(?:문신|반영구|잔흔)|네일\s*(?:모델|실습)|왁싱|"
    r"헤어\s*모델|커트\s*모델|드라이\s*모델|염색\s*모델|펌\s*모델|무료\s*시술|실습\s*모델|연습\s*모델|"
    r"스터디원|스터디 모집|수강생|클래스 모집|레슨|과정 모집|"
    r"창업\s*오디션|창업\s*프로젝트|공급기업|게임\s*오디션|IR\s*데이|참가사\s*모집|창업기업|창업\s*공모|스타트업|"
    r"오케스트라|합창단|성가대|"  # '단원 모집' 단독은 극단 단원 모집(연극)을 죽이므로 제외
    r"체험단|서포터즈|리뷰어|합격 후기|체험 후기|"
    r"차\s*대절|버스\s*대절|응원봉|서포트\s*문구",  # 팬 활동 글 (행사·모집 키워드 오탐)
)
# 제목 전용 제외 — 공고가 아닌 '소식·결과·정리·후기' 글. 본문에 적용하면 "캐스팅 완료 시 조기마감" 같은 정상 공고가 죽는다(실측).
_NEWS_TITLE = re.compile(
    r"캐스팅\s*소식|캐스팅\s*연락|연락\s*왔|합격\s*소식|합격했|캐스팅\s*됐|캐스팅\s*되었|"
    r"자료\s*정리|정리글|모음|캐스팅\s*후기|오디션\s*후기|"
    r"캐스팅 배우\s+\S+\s*$",  # '단편영화 "X" 캐스팅 배우 홍길동' (소속 배우 홍보)
)
# 검색 API 요약 기준 신호어 — 2축: (A) 단독으로 충분한 강신호 / (B) 역할어 + 모집동사가 함께 있어야 하는 약신호
# 실측: "모집" 직결 문체만 잡으면 비배우 직군(쇼호스트·아나운서·성우·댄서·BJ)이 '채용·구해요·찾습니다·급구' 문체라 20%대만 통과.
_CAFE_SIGNALS = re.compile(
    r"오디션|캐스팅|섭외|배역|모집\s*공고|단역|주연|조연|아역|보조출연|엑스트라|퍼포머|출연해\s*주실|출연하실|출연할|"
    r"주인공\s*모집|남주\s*모집|여주\s*모집|남녀\s*주인공|연습생|더빙|나레이션|쇼호스트|라이브\s*커머스|라이브커머스",
)
_ROLE = re.compile(
    r"배우|모델|출연자|출연진|MC|진행자|사회자|아나운서|리포터|성우|댄서|보컬|가수|멤버|인플루언서|크리에이터|유튜버|틱톡커|"
    r"BJ|스트리머|호스트|패널|엑스트라|단역|아역|키즈|시니어|퍼포머|안무",
)
_RECRUIT = re.compile(
    r"모집|구함|구합니다|구해요|구인|채용|찾습니다|찾아요|찾고\s*있|급구|모십니다|지원\s*방법|지원\s*자격|접수|공고|선발|오디션|캐스팅|섭외",
)
# 사기·성인·고수익 BJ 광고 (제목+요약 전체에 적용)
_SCAM = re.compile(r"고수익|고소득|성인\s*방송|19금|숙식\s*제공|당일\s*지급|선불|선입금|대출|투자\s*모집|월\s*\d{3,4}만\s*원?\s*보장|보장\s*수익")
# 카페명 블랙리스트 (키워드 부분 일치) — 맘카페·창업·재테크·중고거래·팬카페만.
# 실측 교훈: '나눔'은 "우리연기할래 정보나눔카페"(2위 소스)를, '뷰티|미용'은 모델나라·헤어모델 카페의 쇼핑몰 촬영 모델 공고까지
# 막았다. 미용 실습 모델 글은 카페가 아니라 본문 제외어(_NEGATIVE)로 거른다.
# '팬카페'는 2026-08-25 실측 — 팬 이벤트("행사 차 대절", 서포트 문구 공모)가 행사 MC·모집 키워드에 잡혀 다수 유입, 진짜 공고는 0건.
_CAFE_BLACKLIST = re.compile(r"맘카페|맘 카페|육아|창업|부동산|주식|재테크|중고나라|벼룩|팬카페|팬 카페|누드")

_TAG_RE = re.compile(r"</?b>")  # API는 검색어 강조 <b>만 씀. 작품명 <수집> 같은 꺾쇠는 보존


@dataclass
class CafeItem:
    title: str
    description: str
    link: str
    cafename: str
    cafeurl: str
    keyword: str


def _clean(text: str) -> str:
    """<b> 태그 제거 + HTML 엔티티 디코드 + 공백 정리"""
    text = _TAG_RE.sub("", text or "")
    prev = None
    while text != prev:
        prev = text
        text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


_BOARD_PREFIX = re.compile(r"^(단편영화|장편영화|독립영화|웹드라마|뮤직비디오|뮤지컬|연극|광고|드라마|영화)(?=[^\s\]\)])")


def _clean_title(title: str) -> str:
    """게시판 카테고리명이 제목에 붙어 오는 패턴 정리 — '단편영화단편영화<수집>' → '[단편영화] <수집>',
    '단편영화KAFA 43기' → '[단편영화] KAFA 43기'. 공백으로 이어진 자연스러운 제목은 건드리지 않는다."""
    t = _clean(title)
    m = re.match(r"^(\S{2,6})\1", t)
    if m:
        t = t[len(m.group(1)):]
    m = _BOARD_PREFIX.match(t)
    if m:
        t = f"[{m.group(1)}] {t[m.end():].lstrip()}"
    return t[:150]


def _short_cafe(cafename: str) -> str:
    """'우리연기할래' 정보나눔카페 - 배우오디션/... → 우리연기할래"""
    name = _clean(cafename)
    name = re.split(r"[\-|★☆\[\(:·]", name)[0]
    name = name.strip(" '\"“”‘’")
    return name[:20] or "네이버카페"


def is_candidate(item: CafeItem) -> tuple[bool, str]:
    """1차 필터. (통과 여부, 사유)"""
    text = f"{item.title} {item.description}"
    if _CAFE_BLACKLIST.search(item.cafename):
        return False, "cafe_blacklist"
    if _NEWS_TITLE.search(item.title):
        return False, "news"
    if _SCAM.search(text):
        return False, "scam"
    strong = _CAFE_SIGNALS.search(text) or _AUDITION_SIGNALS.search(text)
    weak = _ROLE.search(text) and _RECRUIT.search(text)
    if not (strong or weak):
        return False, "no_signal"
    if _NEGATIVE.search(text):
        return False, "negative"
    if len(item.description) < 20:
        return False, "too_short"
    return True, "ok"


def to_audition(item: CafeItem) -> AuditionData:
    text = f"{item.title}\n{item.description}"
    deadline = _extract_deadline(text, posted_at=date.today(), posted_at_exact=False)
    apply_email = extract_apply_email(item.description)
    cafe = _short_cafe(item.cafename)
    desc = (
        f"{item.description}\n\n---\n"
        f"출처: 네이버 카페 '{cafe}' 게시글 (요약만 수집 — 전문·지원 방법은 원문 링크 확인)"
    )
    return AuditionData(
        title=item.title,
        company=None,
        genre=BaseScraper.classify_genre(text),
        deadline=deadline,
        apply_email=apply_email,
        description=desc[:2000],
        requirements=None,
        source_url=item.link,
        source_name=f"네이버카페:{cafe}",
    )


class NaverCafeScraper(BaseScraper):
    source_name = "네이버카페"
    base_url = ENDPOINT

    def __init__(self, keywords: Optional[list[str]] = None):
        self.keywords = keywords or KEYWORDS
        self.client_id = os.environ.get("NAVER_API_HUB_CLIENT_ID", "")
        self.client_secret = os.environ.get("NAVER_API_HUB_CLIENT_SECRET", "")
        self.stats: dict[str, int] = {"fetched": 0, "ok": 0, "cafe_blacklist": 0, "news": 0, "scam": 0, "no_signal": 0, "negative": 0, "too_short": 0, "dup": 0}

    @staticmethod
    def enabled() -> bool:
        return os.environ.get("NAVER_CAFE_ENABLED") == "1" and bool(os.environ.get("NAVER_API_HUB_CLIENT_ID"))

    def _search(self, query: str, start: int = 1) -> list[dict]:
        resp = requests.get(
            ENDPOINT,
            headers={"X-NCP-APIGW-API-KEY-ID": self.client_id, "X-NCP-APIGW-API-KEY": self.client_secret},
            params={"query": query, "display": DISPLAY, "start": start, "sort": "date"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("items", [])

    def fetch_items(self) -> list[CafeItem]:
        if not self.client_id or not self.client_secret:
            raise RuntimeError("NAVER_API_HUB_CLIENT_ID/SECRET 미설정")
        seen: set[str] = set()
        items: list[CafeItem] = []
        for kw in self.keywords:
            for page in range(PAGES_PER_KEYWORD):
                try:
                    raw = self._search(kw, start=1 + page * DISPLAY)
                except Exception as e:
                    logger.warning(f"[네이버카페] '{kw}' 검색 실패: {e}")
                    break
                self.stats["fetched"] += len(raw)
                for r in raw:
                    link = r.get("link", "")
                    if not link or link in seen:
                        self.stats["dup"] += 1
                        continue
                    seen.add(link)
                    items.append(CafeItem(
                        title=_clean_title(r.get("title", "")),
                        description=_clean(r.get("description", "")),
                        link=link,
                        cafename=_clean(r.get("cafename", "")),
                        cafeurl=r.get("cafeurl", ""),
                        keyword=kw,
                    ))
                time.sleep(0.1)  # 50 RPS 한도 대비 여유
        return items

    def scrape(self) -> list[AuditionData]:
        """수집 + 필터. 키워드별·카페별 수율을 self.details에 남겨 crawl_logs.details로 기록 →
        다음 실행에서 learn_low_yield()가 저수율 키워드/카페를 자동 강등한다(31 §5 KPI 게이트 자동화)."""
        # 학습: 최근 실행 기록에서 저수율 키워드·카페 산출 (DB 조회 실패 시 빈 집합 → 전부 실행)
        try:
            from utils.crawl_log import learn_low_yield
            demoted_kw = learn_low_yield(self.source_name, "keywords")
            demoted_cafe = learn_low_yield(self.source_name, "cafes")
        except Exception as e:  # supabase 미설정(dry-run 등)
            logger.debug(f"수율 학습 생략: {e}")
            demoted_kw, demoted_cafe = set(), set()
        if demoted_kw:
            self.keywords = [k for k in self.keywords if k not in demoted_kw]

        kw_stat: dict[str, dict[str, int]] = {}
        cafe_stat: dict[str, dict[str, int]] = {}
        reasons: dict[str, int] = {}
        out: list[AuditionData] = []
        for item in self.fetch_items():
            cafe = _short_cafe(item.cafename)
            kw_stat.setdefault(item.keyword, {"fetched": 0, "passed": 0})["fetched"] += 1
            cafe_stat.setdefault(cafe, {"fetched": 0, "passed": 0})["fetched"] += 1
            if cafe in demoted_cafe:
                reasons["cafe_demoted"] = reasons.get("cafe_demoted", 0) + 1
                continue
            ok, reason = is_candidate(item)
            self.stats[reason] = self.stats.get(reason, 0) + 1
            reasons[reason] = reasons.get(reason, 0) + 1
            if not ok or self.is_noise_title(item.title):
                continue
            kw_stat[item.keyword]["passed"] += 1
            cafe_stat[cafe]["passed"] += 1
            out.append(to_audition(item))
        self.details = {
            "keywords": kw_stat,
            "cafes": dict(sorted(cafe_stat.items(), key=lambda kv: -kv[1]["fetched"])[:60]),
            "reasons": reasons,
            "demoted": {"keywords": sorted(demoted_kw), "cafes": sorted(demoted_cafe)},
            "fetched": self.stats["fetched"], "dup": self.stats["dup"],
        }
        logger.info(f"[네이버카페] 통계: {self.stats} | 강등 키워드 {len(demoted_kw)} 카페 {len(demoted_cafe)}")
        return out


if __name__ == "__main__":
    # dry-run: DB 저장 없이 필터 결과만 출력.  crawler/ 에서: python -m sns_sources.naver_cafe [샘플수]
    # 저장:   python -m sns_sources.naver_cafe --save   (main.py와 동일 경로: filter_expired → upsert_auditions)
    import sys
    from pathlib import Path
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")

    if "--save" in sys.argv:
        from utils.supabase_client import upsert_auditions, pop_classify_stats

        sc = NaverCafeScraper()
        auds = sc.scrape()
        today = date.today()
        fresh = [a for a in auds if not (a.deadline and a.deadline < today)]
        print(f"수집 {len(auds)}건 → 마감 제외 후 {len(fresh)}건 저장 시도")
        saved = upsert_auditions(fresh)
        print(f"✓ 저장 {saved}건 / 분류 {pop_classify_stats()}")
        sys.exit(0)

    s = NaverCafeScraper()
    items = s.fetch_items()
    passed, rejected = [], []
    for it in items:
        ok, reason = is_candidate(it)
        (passed if ok else rejected).append((reason, it))
    print(f"\n수집 {len(items)}건 → 통과 {len(passed)} / 제외 {len(rejected)}  (fetched {s.stats['fetched']}, dup {s.stats['dup']})")
    from collections import Counter
    print("제외 사유:", Counter(r for r, _ in rejected))
    kw_pass = Counter(it.keyword for _, it in passed)
    kw_all = Counter(it.keyword for it in items)
    print("\n[키워드별 통과/수집 (통과율)] — 30% 미만은 노이즈 키워드 후보")
    kw_reasons: dict[str, Counter] = {}
    for reason, it in rejected:
        kw_reasons.setdefault(it.keyword, Counter())[reason] += 1
    for kw, n in kw_all.most_common():
        p = kw_pass.get(kw, 0)
        flag = "  ⚠ " + str(dict(kw_reasons.get(kw, {}))) if n >= 10 and p / n < 0.3 else ""
        print(f"  {kw:18s} {p:4d}/{n:<4d} ({p / n:4.0%}){flag}")
    flagged = {kw for kw, n in kw_all.items() if n >= 10 and kw_pass.get(kw, 0) / n < 0.3}
    if flagged:
        print("\n[⚠ 키워드 제외 샘플]")
        shown: Counter = Counter()
        for reason, it in rejected:
            if it.keyword in flagged and shown[it.keyword] < 4:
                shown[it.keyword] += 1
                print(f"  ({it.keyword} / {reason}) {it.title[:45]} | {_short_cafe(it.cafename)}")
    print("통과 카페:", Counter(_short_cafe(it.cafename) for _, it in passed).most_common(12))
    auds = [to_audition(it) for _, it in passed]
    print("마감일 추출:", sum(1 for a in auds if a.deadline), "/", len(auds), " 이메일:", sum(1 for a in auds if a.apply_email))
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    print(f"\n--- 통과 샘플 {limit}건 ---")
    for a in auds[:limit]:
        print(f"[{a.genre}] {a.title[:55]} | {a.source_name} | 마감 {a.deadline} | {a.source_url}")
    print(f"\n--- 제외 샘플 (negative/no_signal) ---")
    for reason, it in [x for x in rejected if x[0] in ("negative", "no_signal")][:12]:
        print(f"({reason}) {it.title[:55]} | {_short_cafe(it.cafename)}")
