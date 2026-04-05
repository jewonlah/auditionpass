"""
메가폰코리아 (megaphonekorea.com) 크롤러
서버사이드 렌더링 — requests + BeautifulSoup
"""

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


class MegaphoneScraper(BaseScraper):
    source_name = "메가폰코리아"
    base_url = "http://megaphonekorea.com"
    list_url = "http://megaphonekorea.com/audition/variety"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        try:
            resp = requests.get(
                self.list_url, timeout=30, headers=_HEADERS, verify=False
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"[{self.source_name}] 목록 페이지 요청 실���: {e}")
            return results

        soup = BeautifulSoup(resp.text, "lxml")

        cards = soup.select(
            ".audition-list .item, .board-list tr, .post-item, "
            ".audition-card, .list-group-item, article"
        )
        if not cards:
            cards = soup.select("a[href*='audition']")
        logger.info(f"[{self.source_name}] 목록에서 {len(cards)}개 항목 발견")

        for card in cards:
            try:
                audition = self._parse_card(card)
                if audition:
                    results.append(audition)
                    time.sleep(0.5)
            except Exception as e:
                logger.warning(f"[{self.source_name}] 카드 ��싱 오류: {e}")
                continue

        return results

    def _parse_card(self, card) -> AuditionData | None:
        link_el = card if card.name == "a" else card.select_one("a[href]")
        if not link_el or not link_el.get("href"):
            return None

        href = link_el["href"]
        if href.startswith("javascript:") or href == "#":
            return None
        if not href.startswith("http"):
            href = self.base_url + ("" if href.startswith("/") else "/") + href

        title_el = card.select_one(
            ".title, .subject, td:nth-child(2), h3, h4, strong"
        )
        title = title_el.get_text(strip=True) if title_el else card.get_text(strip=True)
        if not title or len(title) < 3:
            return None

        # 공지사항 필터
        if self.is_noise_title(title):
            logger.debug(f"  스킵 (공지): {title[:40]}")
            return None

        company_el = card.select_one(".company, .writer, td:nth-child(3)")
        company = company_el.get_text(strip=True) if company_el else None

        deadline_el = card.select_one(".deadline, .date, td:last-child, time")
        deadline_text = deadline_el.get_text(strip=True) if deadline_el else ""
        deadline = self.parse_deadline(deadline_text)

        detail = self._fetch_detail(href)
        if detail["deadline"] and not deadline:
            deadline = detail["deadline"]

        genre = self.classify_genre(title + " " + (detail["full_text"] or "")[:500])

        description = self.build_description(
            detail["full_text"] or "", detail["phone"], detail["location"]
        )

        return AuditionData(
            title=title,
            company=company,
            genre=genre,
            deadline=deadline,
            apply_email=detail["email"],
            description=description,
            requirements=detail["requirements"],
            source_url=href,
            source_name=self.source_name,
        )

    def _fetch_detail(self, url: str) -> dict:
        result = {
            "full_text": None, "email": None, "phone": None,
            "location": None, "deadline": None, "requirements": None,
        }
        try:
            resp = requests.get(url, timeout=30, headers=_HEADERS, verify=False)
            resp.raise_for_status()
        except requests.RequestException:
            return result

        soup = BeautifulSoup(resp.text, "lxml")

        body_el = soup.select_one(
            ".audition-detail, .view-content, .post-content, article, .content, main"
        )
        full_text = body_el.get_text("\n", strip=True) if body_el else ""
        result["full_text"] = full_text

        result["email"] = self.extract_email(full_text) or self.extract_email(resp.text)
        result["phone"] = self.extract_phone(full_text)
        result["location"] = self.extract_location(full_text)
        result["deadline"] = self.parse_deadline(full_text)

        import re
        req_el = soup.find(
            string=lambda t: t and re.search(r"자격|조건|요��|지원\s*방법", t)
        )
        if req_el:
            parent = req_el.find_parent()
            if parent:
                next_el = parent.find_next_sibling()
                if next_el:
                    result["requirements"] = next_el.get_text("\n", strip=True)[:500]

        return result
