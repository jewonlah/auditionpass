"""
캐스트링크 (castlink.co.kr) 크롤러
서버사이드 렌더링 — requests + BeautifulSoup
"""

import time
import logging
import requests
from bs4 import BeautifulSoup
from .base import BaseScraper, AuditionData

logger = logging.getLogger(__name__)


class CastlinkScraper(BaseScraper):
    source_name = "캐스트링크"
    base_url = "https://castlink.co.kr"
    list_url = "https://castlink.co.kr/ko/service/auditions"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        try:
            resp = requests.get(self.list_url, timeout=30, headers=_HEADERS)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"[{self.source_name}] 목록 페이지 요청 실패: {e}")
            return results

        soup = BeautifulSoup(resp.text, "lxml")

        # 공고 카드/행 요소 탐색 — 사이트 구조에 맞게 조정
        cards = soup.select("table tbody tr, .audition-card, .audition-item, .list-item")
        if not cards:
            # 테이블이 아닌 경우 a[href*=audition] 패턴으로 시도
            cards = soup.select("a[href*='audition']")
        logger.info(f"[{self.source_name}] 목록에서 {len(cards)}개 항목 발견")

        for card in cards:
            try:
                audition = self._parse_card(card)
                if audition:
                    results.append(audition)
                    time.sleep(0.5)
            except Exception as e:
                logger.warning(f"[{self.source_name}] 카드 파싱 오류: {e}")
                continue

        return results

    def _parse_card(self, card) -> AuditionData | None:
        # 링크 추출
        link_el = card if card.name == "a" else card.select_one("a[href]")
        if not link_el or not link_el.get("href"):
            return None

        href = link_el["href"]
        if not href.startswith("http"):
            href = self.base_url + href

        # 제목 추출
        title_el = card.select_one(
            ".title, .audition-title, td:nth-child(2), h3, h4, strong"
        )
        title = title_el.get_text(strip=True) if title_el else card.get_text(strip=True)
        if not title or len(title) < 3:
            return None

        # 주최사
        company_el = card.select_one(".company, .producer, td:nth-child(3)")
        company = company_el.get_text(strip=True) if company_el else None

        # 마감일
        deadline_el = card.select_one(
            ".deadline, .date, .end-date, td:last-child, time"
        )
        deadline_text = deadline_el.get_text(strip=True) if deadline_el else ""
        deadline = self.parse_deadline(deadline_text)

        # 상세 페이지에서 추가 정보 수집
        description, requirements, apply_email = self._fetch_detail(href)

        genre = self.classify_genre(title + " " + (description or ""))

        return AuditionData(
            title=title,
            company=company,
            genre=genre,
            deadline=deadline,
            apply_email=apply_email,
            description=description,
            requirements=requirements,
            source_url=href,
            source_name=self.source_name,
        )

    def _fetch_detail(self, url: str) -> tuple[str | None, str | None, str | None]:
        try:
            resp = requests.get(url, timeout=30, headers=_HEADERS)
            resp.raise_for_status()
        except requests.RequestException:
            return None, None, None

        soup = BeautifulSoup(resp.text, "lxml")

        # 본문 영역
        body_el = soup.select_one(
            ".audition-detail, .content, .detail-content, article, .post-body, main"
        )
        full_text = body_el.get_text("\n", strip=True) if body_el else ""

        description = full_text[:1000] if full_text else None
        apply_email = self.extract_email(full_text or resp.text)

        # 지원 자격 섹션
        req_el = soup.find(
            string=lambda t: t and ("자격" in t or "조건" in t or "요건" in t)
        )
        requirements = None
        if req_el:
            next_el = req_el.find_parent().find_next_sibling()
            if next_el:
                requirements = next_el.get_text("\n", strip=True)[:500]

        return description, requirements, apply_email


_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
}
