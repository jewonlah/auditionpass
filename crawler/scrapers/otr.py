"""
OTR (otr.co.kr) 크롤러
JS 렌더링 필요 — Playwright + BeautifulSoup
"""

import time
import logging
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout
from bs4 import BeautifulSoup
from .base import BaseScraper, AuditionData

logger = logging.getLogger(__name__)


class OtrScraper(BaseScraper):
    source_name = "OTR"
    base_url = "https://otr.co.kr"
    list_url = "https://otr.co.kr/audition"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
                ),
                locale="ko-KR",
            )
            page = context.new_page()

            try:
                page.goto(self.list_url, timeout=30000)
                page.wait_for_load_state("networkidle", timeout=15000)
            except PwTimeout:
                logger.warning(f"[{self.source_name}] 페이지 로딩 타임아웃, 현재 상태로 진행")

            for _ in range(3):
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(1)

            html = page.content()
            soup = BeautifulSoup(html, "lxml")

            cards = soup.select(
                ".audition-item, .audition-card, .list-item, "
                ".board-list tr, article, [class*='audition']"
            )
            if not cards:
                cards = soup.select("a[href*='audition']")
            logger.info(f"[{self.source_name}] 목록에서 {len(cards)}개 항목 발견")

            for card in cards:
                try:
                    audition = self._parse_card(card, page)
                    if audition:
                        results.append(audition)
                        time.sleep(1)
                except Exception as e:
                    logger.warning(f"[{self.source_name}] 카드 파싱 오류: {e}")
                    continue

            browser.close()

        return results

    def _parse_card(self, card, page) -> AuditionData | None:
        link_el = card if card.name == "a" else card.select_one("a[href]")
        if not link_el or not link_el.get("href"):
            return None

        href = link_el["href"]
        if href.startswith("javascript:") or href == "#":
            return None
        if not href.startswith("http"):
            href = self.base_url + ("" if href.startswith("/") else "/") + href

        # 목록/멤버 페이지 등 비상세 URL 스킵
        if any(p in href for p in (
            "?mode=list", "/members/", "/login", "/register",
        )):
            return None
        # /audition/ 정확히 일치 (뒤에 쿼리나 ID 없음)는 목록 페이지
        if href.rstrip("/").endswith("/audition"):
            return None

        title_el = card.select_one(
            ".title, .audition-title, h3, h4, strong, td:nth-child(2)"
        )
        title = title_el.get_text(strip=True) if title_el else card.get_text(strip=True)
        if not title or len(title) < 3:
            return None

        # 공지사항 필터
        if self.is_noise_title(title):
            logger.debug(f"  스킵 (공지): {title[:40]}")
            return None

        company_el = card.select_one(".company, .producer, td:nth-child(3)")
        company = company_el.get_text(strip=True) if company_el else None

        deadline_el = card.select_one(".deadline, .date, td:last-child, time")
        deadline_text = deadline_el.get_text(strip=True) if deadline_el else ""
        deadline = self.parse_deadline(deadline_text)

        detail = self._fetch_detail(page, href)
        if detail["deadline"] and not deadline:
            deadline = detail["deadline"]

        genre = self.classify_genre(title + " " + (detail["full_text"] or "")[:500])

        description = self.build_description(
            detail["full_text"] or "", detail["phone"], detail["location"]
        )

        return AuditionData(
            title=title,
            company=company or detail.get("company"),
            genre=genre,
            deadline=deadline,
            apply_email=detail["email"],
            description=description,
            requirements=detail["requirements"],
            source_url=href,
            source_name=self.source_name,
        )

    def _fetch_detail(self, page, url: str) -> dict:
        result = {
            "full_text": None, "email": None, "phone": None,
            "location": None, "deadline": None, "requirements": None,
            "company": None,
        }
        try:
            page.goto(url, timeout=20000)
            page.wait_for_load_state("networkidle", timeout=10000)
        except PwTimeout:
            pass

        html = page.content()
        soup = BeautifulSoup(html, "lxml")

        body_el = soup.select_one(
            ".audition-detail, .detail-content, .content, article, main"
        )
        full_text = body_el.get_text("\n", strip=True) if body_el else ""
        result["full_text"] = full_text

        # 이메일
        result["email"] = self.extract_email(full_text) or self.extract_email(html)

        # 전화번호
        result["phone"] = self.extract_phone(full_text)

        # 장소
        result["location"] = self.extract_location(full_text)

        # 마감일 (상세 페이지에서 재시도)
        result["deadline"] = self.parse_deadline(full_text)

        # 지원 자격
        import re
        req_el = soup.find(
            string=lambda t: t and re.search(r"자격|조건|요건|지원\s*방법", t)
        )
        if req_el:
            parent = req_el.find_parent()
            if parent:
                next_el = parent.find_next_sibling()
                if next_el:
                    result["requirements"] = next_el.get_text("\n", strip=True)[:500]

        return result
