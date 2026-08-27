"""
플필 (plfil.com) 크롤러
서버사이드 렌더링 — requests + BeautifulSoup
URL 패턴: plfil.com/casting/{id}
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


class PlfilScraper(BaseScraper):
    source_name = "플필"
    base_url = "https://plfil.com"
    list_url = "https://plfil.com/casting"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        try:
            resp = requests.get(self.list_url, timeout=30, headers=_HEADERS)
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"[{self.source_name}] 목록 페이지 요청 실패: {e}")
            return results

        soup = BeautifulSoup(resp.text, "lxml")

        # 상세 페이지 링크 수집: /casting/{id} 패턴
        links = soup.select("a[href*='/casting/']")
        seen_urls: set[str] = set()
        detail_urls: list[tuple[str, str]] = []

        for link in links:
            href = link.get("href", "")
            if not href or href == "/casting" or href == "/casting/":
                continue
            if not href.startswith("http"):
                href = self.base_url + ("" if href.startswith("/") else "/") + href

            # /casting/{숫자id} 패턴만
            if "/casting/" not in href or href in seen_urls:
                continue
            seen_urls.add(href)

            title_text = link.get_text(strip=True)
            detail_urls.append((href, title_text))

        logger.info(f"[{self.source_name}] 목록에서 {len(detail_urls)}개 상세 링크 발견")

        for url, list_title in detail_urls:
            try:
                audition = self._fetch_and_parse(url, list_title)
                if audition:
                    results.append(audition)
                time.sleep(0.5)
            except Exception as e:
                logger.warning(f"[{self.source_name}] 상세 파싱 오류 ({url}): {e}")
                continue

        return results

    @staticmethod
    def _clean_title(title: str) -> str:
        """목록 카드 전체 텍스트가 제목으로 들어오는 오염 정리 (실측 9/9건):
        '연극진행중[오디션 공고] …페이 : 10만원 ~ 10만원D-11/2026-09-05마감작성일2026-08-25'
        → 카테고리+진행중 접두 제거, 페이/디데이/작성일 메타 이후 절단."""
        t = re.sub(r"^(연극|영화|드라마|CF|뮤지컬|웹드라마|기타)\s*(?:진행중|마감)", "", title).strip()
        t = re.split(r"페이\s*[:：]|D-\d+/|작성일\s*\d{4}", t)[0].strip()
        return t[:150]

    def _fetch_and_parse(self, url: str, list_title: str) -> AuditionData | None:
        try:
            resp = requests.get(url, timeout=30, headers=_HEADERS)
            resp.raise_for_status()
        except requests.RequestException:
            return None

        soup = BeautifulSoup(resp.text, "lxml")

        # 제목
        title_el = soup.select_one(
            "h1, h2, .casting-title, .title, .post-title, [class*='title']"
        )
        title = title_el.get_text(strip=True) if title_el else list_title
        title = self._clean_title(title)
        if not title or len(title) < 3:
            return None

        # 공지사항 필터
        if self.is_noise_title(title):
            return None

        # 본문 전체 텍스트
        body_el = soup.select_one(
            ".casting-detail, .detail-content, .content, .post-body, "
            "article, main, .view-content"
        )
        full_text = body_el.get_text("\n", strip=True) if body_el else ""
        full_html = resp.text

        # 주최사
        company = self._extract_field(
            soup, full_text,
            ["제작사", "주최", "주관", "회사", "소속사", "기획사", "제작"]
        )

        # 마감일
        deadline_text = self._extract_field(
            soup, full_text,
            ["마감", "접수기간", "모집기간", "지원기간", "마감일", "접수마감"]
        )
        deadline = self.parse_deadline_smart(deadline_text or "")

        # 이메일
        apply_email = self.extract_email(full_text) or self.extract_email(full_html)

        # 전화번호, 장소
        phone = self.extract_phone(full_text)
        location = self.extract_location(full_text)

        # 장르
        genre = self.classify_genre(title + " " + full_text[:500])

        description = self.build_description(full_text, phone, location)

        return AuditionData(
            title=title,
            company=company,
            genre=genre,
            deadline=deadline,
            apply_email=apply_email,
            description=description,
            requirements=None,
            source_url=url,
            source_name=self.source_name,
        )

    @staticmethod
    def _extract_field(soup, full_text: str, keywords: list[str]) -> str | None:
        """키워드 라벨 뒤의 값 추출"""
        import re
        # HTML 구조에서 먼저 시도 (th/dt/label + td/dd/span)
        for kw in keywords:
            el = soup.find(string=re.compile(kw))
            if el:
                parent = el.find_parent()
                if parent:
                    sibling = parent.find_next_sibling()
                    if sibling:
                        val = sibling.get_text(strip=True)
                        if val and len(val) > 1:
                            return val[:200]

        # 텍스트에서 "키워드: 값" 패턴
        for kw in keywords:
            pat = rf"{kw}\s*[:：]\s*(.+)"
            match = re.search(pat, full_text)
            if match:
                return match.group(1).strip()[:200]

        return None
