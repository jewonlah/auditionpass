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
from sns_sources.instagram_caption import _AUDITION_SIGNALS, _extract_deadline

logger = logging.getLogger(__name__)

ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/cafearticle"

# 키워드 셋 — 정밀도 순. 넓은 키워드("배우 모집")는 필터에 기대고, 좁은 키워드는 그대로 신뢰.
KEYWORDS: list[str] = [
    "단편영화 캐스팅",
    "단편영화 배우 모집",
    "독립영화 배우 모집",
    "웹드라마 오디션",
    "웹드라마 배우 모집",
    "뮤지컬 오디션",
    "연극 배우 모집",
    "아역배우 모집",
    "보조출연 모집",
    "캐스팅 공고",
    "배우 오디션",
    "오디션 공고",
    "배우 모집",
    "출연자 모집",
]
PAGES_PER_KEYWORD = 1   # display=100 × 1페이지 (sort=date). 더 깊이 긁을 필요 없음 — 매일 돈다.
DISPLAY = 100

# 제외 신호 — 실측 노이즈 유형: 뷰티 시술 모델, 스터디/수강, 창업 오디션, 음악 단원, 체험단, 후기
_NEGATIVE = re.compile(
    r"반영구|문신|시술|속눈썹|헤어라인|눈썹|네일|왁싱|피부|두피|"
    r"스터디원|스터디 모집|수강생|클래스 모집|레슨|과정 모집|"
    r"창업 오디션|창업 프로젝트|공급기업|"
    r"오케스트라|합창단|성가대|단원 모집|"
    r"체험단|서포터즈|리뷰어|합격 후기|체험 후기",
)
# 제목 전용 제외 — 공고가 아닌 '소식·결과·정리·후기' 글. 본문에 적용하면 "캐스팅 완료 시 조기마감" 같은 정상 공고가 죽는다(실측).
_NEWS_TITLE = re.compile(
    r"캐스팅\s*소식|캐스팅\s*연락|연락\s*왔|합격\s*소식|합격했|캐스팅\s*됐|캐스팅\s*되었|"
    r"자료\s*정리|정리글|모음|캐스팅\s*후기|오디션\s*후기|"
    r"캐스팅 배우\s+\S+\s*$",  # '단편영화 "X" 캐스팅 배우 홍길동' (소속 배우 홍보)
)
# 검색 API 요약 기준 신호어 — instagram 신호어 + 카페 문체('배우님들 모집합니다', '구합니다', '구인')
_CAFE_SIGNALS = re.compile(
    r"오디션|캐스팅|배우[^\n]{0,8}모집|배우[^\n]{0,8}구합니다|배우[^\n]{0,8}구인|모델\s*모집|출연자\s*모집|출연해\s*주실|"
    r"섭외|배역|모집\s*공고|단역|주연|조연|아역|보조출연|퍼포머|주인공\s*모집|남주\s*모집|여주\s*모집|남녀\s*주인공",
)
# 카페명 블랙리스트 (키워드 부분 일치) — 뷰티·맘카페·창업 계열
_CAFE_BLACKLIST = re.compile(r"모델나라|뷰티|미용|네일|맘카페|맘 카페|창업|부동산|주식")

_TAG_RE = re.compile(r"</?b>")  # API는 검색어 강조 <b>만 씀. 작품명 <수집> 같은 꺾쇠는 보존
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


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
    if not (_CAFE_SIGNALS.search(text) or _AUDITION_SIGNALS.search(text)):
        return False, "no_signal"
    if _NEGATIVE.search(text):
        return False, "negative"
    if len(item.description) < 20:
        return False, "too_short"
    return True, "ok"


def to_audition(item: CafeItem) -> AuditionData:
    text = f"{item.title}\n{item.description}"
    deadline = _extract_deadline(text, posted_at=date.today())
    m = _EMAIL_RE.search(item.description)
    apply_email = m.group() if m and "*" not in m.group() else None
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
        self.stats: dict[str, int] = {"fetched": 0, "ok": 0, "cafe_blacklist": 0, "news": 0, "no_signal": 0, "negative": 0, "too_short": 0, "dup": 0}

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
        out: list[AuditionData] = []
        for item in self.fetch_items():
            ok, reason = is_candidate(item)
            self.stats[reason] = self.stats.get(reason, 0) + 1
            if not ok:
                continue
            if self.is_noise_title(item.title):
                continue
            out.append(to_audition(item))
        logger.info(f"[네이버카페] 통계: {self.stats}")
        return out


if __name__ == "__main__":
    # dry-run: DB 저장 없이 필터 결과만 출력.  crawler/ 에서: python -m sns_sources.naver_cafe
    import sys
    from pathlib import Path
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    s = NaverCafeScraper()
    items = s.fetch_items()
    passed, rejected = [], []
    for it in items:
        ok, reason = is_candidate(it)
        (passed if ok else rejected).append((reason, it))
    print(f"\n수집 {len(items)}건 → 통과 {len(passed)} / 제외 {len(rejected)}  (fetched {s.stats['fetched']}, dup {s.stats['dup']})")
    from collections import Counter
    print("제외 사유:", Counter(r for r, _ in rejected))
    print("통과 키워드:", Counter(it.keyword for _, it in passed).most_common())
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
