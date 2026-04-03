"""
캐스팅나라 (castingnara.com) 크롤러
서버사이드 렌더링 (PHP) — requests + BeautifulSoup
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

_LIST_URL = "https://castingnara.com/guin_list.php"
_MAX_PAGES = 2


class CastingnaraScraper(BaseScraper):
    source_name = "캐스팅나��"
    base_url = "https://castingnara.com"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        for page_num in range(1, _MAX_PAGES + 1):
            params = {"pg": page_num}
            page_results = self._scrape_list(params)
            results.extend(page_results)
            if not page_results:
                break

        return results

    def _scrape_list(self, params: dict) -> list[AuditionData]:
        results: list[AuditionData] = []

        try:
            resp = requests.get(
                _LIST_URL, params=params, timeout=30, headers=_HEADERS
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"[{self.source_name}] 목록 요청 실패: {e}")
            return results

        soup = BeautifulSoup(resp.text, "lxml")

        # 각 카드: 상세 링크가 포함된 td
        detail_links = soup.select("a[href*='guin_detail.php']")
        seen_urls: set[str] = set()
        items: list[tuple[str, str, BeautifulSoup]] = []

        for link in detail_links:
            href = link.get("href", "")
            if not href or href in seen_urls:
                continue

            # 제목 링크만 (bold 스타일)
            style = link.get("style", "")
            if "bold" not in style and "상세내용" not in link.get_text(strip=True):
                continue

            if not href.startswith("http"):
                href = self.base_url + "/" + href.lstrip("./")
            seen_urls.add(href)

            title = link.get_text(strip=True)
            if not title or len(title) < 3 or title == "상세내용":
                continue

            # 상위 카드 컨테이너에서 메타 정보 추출
            card = link.find_parent("td", style=re.compile(r"border.*ddd"))
            items.append((href, title, card))

        logger.info(f"[{self.source_name}] 목록에서 {len(items)}개 항목 발견")

        for url, title, card in items:
            try:
                audition = self._parse_item(url, title, card)
                if audition:
                    results.append(audition)
                time.sleep(0.5)
            except Exception as e:
                logger.warning(f"[{self.source_name}] 파싱 오류 ({url}): {e}")
                continue

        return results

    def _parse_item(
        self, url: str, title: str, card
    ) -> AuditionData | None:
        if self.is_noise_title(title):
            return None

        # 카드에서 메타 정보 추출
        company = None
        card_text = card.get_text("\n", strip=True) if card else ""

        company_match = re.search(r"회사명\s*[:：]\s*(.+)", card_text)
        if company_match:
            company = company_match.group(1).strip().split("\n")[0]

        # 상세 페이지에서 추가 정보
        detail = self._fetch_detail(url)

        deadline = detail["deadline"]
        apply_email = detail["email"]
        genre = self.classify_genre(title + " " + (detail["full_text"] or "")[:500])

        description = self.build_description(
            detail["full_text"] or "", detail["phone"], detail["location"]
        )

        return AuditionData(
            title=title,
            company=company or detail.get("company"),
            genre=genre,
            deadline=deadline,
            apply_email=apply_email,
            description=description,
            requirements=detail["requirements"],
            source_url=url,
            source_name=self.source_name,
        )

    def _fetch_detail(self, url: str) -> dict:
        result = {
            "full_text": None, "email": None, "phone": None,
            "location": None, "deadline": None, "requirements": None,
            "company": None,
        }
        try:
            resp = requests.get(url, timeout=30, headers=_HEADERS)
            resp.raise_for_status()
        except requests.RequestException:
            return result

        soup = BeautifulSoup(resp.text, "lxml")

        body_el = soup.select_one(
            ".view-content, .content, article, main, "
            "td[style*='line-height']"
        )
        full_text = body_el.get_text("\n", strip=True) if body_el else ""
        result["full_text"] = full_text

        result["email"] = self.extract_email(full_text) or self.extract_email(resp.text)
        result["phone"] = self.extract_phone(full_text)
        result["location"] = self.extract_location(full_text)
        result["deadline"] = self.parse_deadline(full_text)

        # 지원 자격
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
