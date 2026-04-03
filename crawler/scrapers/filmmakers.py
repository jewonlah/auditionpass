"""
필메코 (filmmakers.co.kr) 크롤러
서버사이드 렌더링 (Rhymix CMS) — requests + BeautifulSoup
카테고리: /actorCasting (배우), /performerCasting (모델/퍼포머), /actorPartTimeJob (단기/알바)
"""

import time
import re
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

# 수집 대상 카테고리 URL (첫 2페이지씩)
_CATEGORIES = [
    ("https://www.filmmakers.co.kr/actorCasting", "배우"),
    ("https://www.filmmakers.co.kr/performerCasting", "모델"),
    ("https://www.filmmakers.co.kr/actorPartTimeJob", "기타"),
]

_MAX_PAGES = 2


class FilmmakersScraper(BaseScraper):
    source_name = "필메코"
    base_url = "https://www.filmmakers.co.kr"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        for category_url, default_genre in _CATEGORIES:
            for page_num in range(1, _MAX_PAGES + 1):
                url = category_url if page_num == 1 else f"{category_url}/page/{page_num}"
                page_results = self._scrape_list(url, default_genre)
                results.extend(page_results)

                if not page_results:
                    break  # 더 이상 결과 없으면 다음 카테고리로

        return results

    def _scrape_list(self, list_url: str, default_genre: str) -> list[AuditionData]:
        results: list[AuditionData] = []

        try:
            resp = requests.get(list_url, timeout=30, headers=_HEADERS)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"[{self.source_name}] 목록 요청 실패 ({list_url}): {e}")
            return results

        soup = BeautifulSoup(resp.text, "lxml")

        # 각 공고 카드: div with onclick="location.href='/actorCasting/{id}'"
        cards = soup.select(
            "div[onclick*='actorCasting'], div[onclick*='performerCasting'], "
            "div[onclick*='actorPartTimeJob']"
        )
        if not cards:
            # 폴백: h2 > a 링크로 탐색
            cards = soup.select(
                "h2 a[href*='actorCasting'], h2 a[href*='performerCasting'], "
                "h2 a[href*='actorPartTimeJob']"
            )

        logger.info(f"[{self.source_name}] {list_url} 에서 {len(cards)}개 항목 발견")

        for card in cards:
            try:
                audition = self._parse_card(card, default_genre)
                if audition:
                    results.append(audition)
                    time.sleep(0.5)
            except Exception as e:
                logger.warning(f"[{self.source_name}] 카드 파싱 오류: {e}")
                continue

        return results

    def _parse_card(self, card, default_genre: str) -> AuditionData | None:
        # URL 추출
        href = None
        if card.name == "a":
            href = card.get("href", "")
        else:
            # div onclick에서 URL 추출
            onclick = card.get("onclick", "")
            match = re.search(r"location\.href='([^']+)'", onclick)
            if match:
                href = match.group(1)
            else:
                link_el = card.select_one("a[href]")
                if link_el:
                    href = link_el.get("href", "")

        if not href:
            return None
        if not href.startswith("http"):
            href = self.base_url + ("" if href.startswith("/") else "/") + href

        # 제목: h2 > a
        title_el = card.select_one("h2 a") or card.select_one("h2")
        if card.name == "a":
            title = card.get_text(strip=True)
        elif title_el:
            title = title_el.get_text(strip=True)
        else:
            title = card.get_text(strip=True)[:100]

        if not title or len(title) < 3:
            return None
        if self.is_noise_title(title):
            return None

        # 메타 필드 추출 (라벨: 값 패턴)
        meta_spans = card.select("div.flex.flex-wrap span")
        company = None
        for span in meta_spans:
            label_el = span.select_one("span.text-xs")
            if label_el:
                label = label_el.get_text(strip=True)
                value = span.get_text(strip=True).replace(label, "").strip()
                if label == "제작" and value:
                    company = value

        # 카테고리 배지에서 장르 보강
        category_el = card.select_one("span.bg-neutral-200, span[class*='bg-neutral']")
        category_text = category_el.get_text(strip=True) if category_el else ""
        genre = self.classify_genre(title + " " + category_text) or default_genre

        # 상세 페이지
        detail = self._fetch_detail(href)
        deadline = detail["deadline"]
        apply_email = detail["email"]
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
            source_url=href,
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

        # 본문 영역
        body_el = soup.select_one(
            "article, .content, .post-body, .document-content, main"
        )
        full_text = body_el.get_text("\n", strip=True) if body_el else ""
        result["full_text"] = full_text

        # 이메일
        result["email"] = self.extract_email(full_text) or self.extract_email(resp.text)

        # 전화번호
        result["phone"] = self.extract_phone(full_text)

        # 장소
        result["location"] = self.extract_location(full_text)

        # 마감일 — 필메코는 본문 내 "모집마감", "접수기한" 등에 포함
        deadline_keywords = ["마감", "접수기간", "모집기간", "접수마감", "모집마감"]
        for kw in deadline_keywords:
            el = soup.find(string=re.compile(kw))
            if el:
                context = el.string or ""
                parent = el.find_parent()
                if parent:
                    context = parent.get_text(strip=True)
                dl = self.parse_deadline(context)
                if dl:
                    result["deadline"] = dl
                    break
        if not result["deadline"]:
            result["deadline"] = self.parse_deadline(full_text)

        # 제작사 (상세 페이지에서 재시도)
        for kw in ["제작사", "제작", "주최", "기획"]:
            el = soup.find(string=re.compile(kw))
            if el:
                parent = el.find_parent()
                if parent:
                    sibling = parent.find_next_sibling()
                    if sibling:
                        val = sibling.get_text(strip=True)
                        if val and len(val) > 1:
                            result["company"] = val[:100]
                            break

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
