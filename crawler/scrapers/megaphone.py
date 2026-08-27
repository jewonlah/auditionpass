"""
메가폰코리아 (megaphonekorea.com) 크롤러 — 명시적 셀렉터 재작성 (플랜 30 §2 2-5)

옛 구현은 `.audition-list .item, .board-list tr, .post-item, article`을 한 번에 시도하고
그래도 안 걸리면 `a[href*='audition']`로 폴백하는 **광역 셀렉터 스프레이**였다. 결과:
네비게이션 문구("놓쳐서는 안될 오디션 정보")가 공고로 잡히고, 마감·제작사는 목록에
버젓이 있는데도 전부 None이었으며, source_url이 조회수 증가용 엔드포인트라
유저가 원문 링크를 눌러도 빈 페이지가 떴다.

실제 구조 (2026-08-27 실측):
- 목록 `/audition/variety` — 유일한 목록. `li > div.infotext`에
  `.subject`(작품) `.producer`(제작사) `.subject_matter > a`(제목·링크) `.casting`(배역),
  `div.typebox .d_daybox .text`에 마감 표기.
- 목록 링크는 `/index.php/dataFunction/auditionViewUp/{id}` — 조회수만 올리고
  JS로 `/audition/detail/{id}`로 보낸다. **저장할 URL은 후자**다.
- 상세 `/audition/detail/{id}` — 마감된 공고면 `alert('종료된 오디션 입니다.')` 스텁(149B)만
  내려온다. 살아있으면 40KB 페이지의 `div.auditiondetails_content`가 본문.
"""

import re
import time
import logging
import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, AuditionData

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

_ID_RE = re.compile(r"auditionViewUp/(\d+)")
# 상세가 마감이면 본문 대신 이 스텁만 온다
_CLOSED_RE = re.compile(r"종료된\s*오디션|alert\(")
# 목록의 마감 표기 중 "날짜 미상이지만 진행 중"을 뜻하는 것들
_OPEN_UNDATED = ("채용시", "상시", "수시", "협의")

MAX_PAGES = 3
# 제작사 칸에 실제로 들어오는 무의미 값 (실측: 'x', '비공개', '미정')
_EMPTY_COMPANY = {"x", "X", "-", "비공개", "미정", "없음", "협의"}


class MegaphoneScraper(BaseScraper):
    source_name = "메가폰코리아"
    base_url = "http://megaphonekorea.com"
    list_url = "http://megaphonekorea.com/audition/variety"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []
        seen: set[str] = set()
        sess = requests.Session()
        sess.headers.update(_HEADERS)

        for page in range(1, MAX_PAGES + 1):
            url = self.list_url if page == 1 else f"{self.list_url}/page/{page}"
            cards = self._fetch_cards(sess, url)
            if not cards:
                break
            for card in cards:
                if card["id"] in seen:
                    continue
                seen.add(card["id"])
                try:
                    audition = self._build(sess, card)
                except Exception as e:
                    logger.warning(f"[{self.source_name}] 카드 파싱 오류 #{card['id']}: {e}")
                    continue
                if audition:
                    results.append(audition)
                time.sleep(1.0)

        logger.info(f"[{self.source_name}] 진행 중 공고 {len(results)}건")
        return results

    def _fetch_cards(self, sess: requests.Session, url: str) -> list[dict]:
        """목록 1페이지 → 진행 중 카드만. 마감 표기가 '기간종료'면 여기서 버린다."""
        try:
            resp = sess.get(url, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"[{self.source_name}] 목록 페이지 요청 실패 ({url}): {e}")
            return []
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")

        cards: list[dict] = []
        closed = 0
        for a in soup.select('a[href*="auditionViewUp"]'):
            m = _ID_RE.search(a.get("href") or "")
            li = a.find_parent("li")
            if not m or li is None:
                continue
            deadline_text = self._text(li.select_one(".d_daybox .text"))
            if "종료" in deadline_text:
                closed += 1
                continue
            cards.append({
                "id": m.group(1),
                "title": self._text(a),
                "work": self._text(li.select_one(".subject")),
                "company": self._text(li.select_one(".producer")).replace("제작", "").strip(),
                "casting": self._text(li.select_one(".casting")),
                "deadline_text": deadline_text,
            })
        logger.info(f"[{self.source_name}] {url.split('/')[-1]}: 진행 중 {len(cards)} / 마감 {closed}")
        return cards

    def _build(self, sess: requests.Session, card: dict) -> AuditionData | None:
        detail_url = f"{self.base_url}/audition/detail/{card['id']}"
        body = self._fetch_detail(sess, detail_url)
        if body is None:
            return None  # 목록엔 진행 중인데 상세는 마감 — 상세를 믿는다

        company = card["company"]
        if company in _EMPTY_COMPANY or len(company) < 2:
            company = None

        title = card["title"] or card["work"]
        if not title or self.is_noise_title(title):
            return None

        # 마감: 목록 표기가 날짜면 그걸, "채용시 마감" 같은 상시 표기는 미상으로 둔다.
        # 본문에서 억지로 뽑지 않는다 — 촬영일을 마감으로 저장하던 문제(2-3)와 같은 함정이다.
        deadline = None
        if not any(k in card["deadline_text"] for k in _OPEN_UNDATED):
            deadline = self.parse_deadline_smart(card["deadline_text"])

        text = f"{card['work']}\n{card['casting']}\n{body}"
        return AuditionData(
            title=title[:150],
            company=company,
            genre=self.classify_genre(f"{title} {card['work']} {card['casting']}"),
            deadline=deadline,
            # 사이트 자체 메일(info@megaphonekorea.com)은 base_url 기준으로 자동 제외된다
            apply_email=self.extract_email(body),
            description=self.build_description(text.strip())[:2000],
            requirements=card["casting"] or None,
            source_url=detail_url,
            source_name=self.source_name,
        )

    def _fetch_detail(self, sess: requests.Session, url: str) -> str | None:
        """상세 본문. 마감 스텁이면 None."""
        try:
            resp = sess.get(url, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.warning(f"[{self.source_name}] 상세 요청 실패 ({url}): {e}")
            return None
        resp.encoding = resp.apparent_encoding or "utf-8"
        if len(resp.text) < 1000 and _CLOSED_RE.search(resp.text):
            return None
        soup = BeautifulSoup(resp.text, "lxml")
        content = soup.select_one("div.auditiondetails_content") or soup.select_one("#content_area")
        if content is None:
            return None
        return " ".join(content.get_text(" ").split())

    @staticmethod
    def _text(el) -> str:
        return " ".join(el.stripped_strings) if el is not None else ""
