"""
캐스틱 (castik.co.kr) 크롤러
Next.js React 앱 — Playwright + BeautifulSoup
URL 패턴: castik.co.kr/auditions/{uuid}
"""

import time
import logging
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout
from bs4 import BeautifulSoup
from .base import BaseScraper, AuditionData

logger = logging.getLogger(__name__)


class CastikScraper(BaseScraper):
    source_name = "캐스틱"
    base_url = "https://castik.co.kr"
    list_url = "https://castik.co.kr/auditions"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()

                # 목록 페이지 로드
                page.goto(self.list_url, timeout=30000)
                page.wait_for_load_state("networkidle", timeout=15000)

                # 스크롤하여 추가 콘텐츠 로드
                for _ in range(3):
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    time.sleep(1)

                html = page.content()
                soup = BeautifulSoup(html, "lxml")

                # 카드 링크 수집: /auditions/{uuid}
                cards = soup.select('a[href*="/auditions/"]')
                detail_urls: list[tuple[str, str]] = []
                seen: set[str] = set()

                for card in cards:
                    href = card.get("href", "")
                    if not href or href == "/auditions" or href == "/auditions/":
                        continue
                    if href in seen:
                        continue
                    seen.add(href)

                    full_url = self.base_url + href if href.startswith("/") else href

                    # 제목 추출 (h3 태그)
                    title_el = card.select_one("h3")
                    title = title_el.get_text(strip=True) if title_el else ""

                    detail_urls.append((full_url, title))

                logger.info(
                    f"[{self.source_name}] 목록에서 {len(detail_urls)}개 상세 링크 발견"
                )

                # 상세 페이지 크롤링
                for url, list_title in detail_urls:
                    try:
                        audition = self._fetch_detail(page, url, list_title)
                        if audition:
                            results.append(audition)
                        time.sleep(0.5)
                    except Exception as e:
                        logger.warning(
                            f"[{self.source_name}] 상세 파싱 오류 ({url}): {e}"
                        )
                        continue

                browser.close()

        except PwTimeout as e:
            logger.error(f"[{self.source_name}] 페이지 로딩 타임아웃: {e}")
        except Exception as e:
            logger.error(f"[{self.source_name}] 크롤링 실패: {e}")

        return results

    def _fetch_detail(
        self, page, url: str, list_title: str
    ) -> AuditionData | None:
        try:
            page.goto(url, timeout=30000)
            page.wait_for_load_state("networkidle", timeout=15000)
        except PwTimeout:
            logger.warning(f"[{self.source_name}] 상세 페이지 타임아웃: {url}")
            return None

        html = page.content()
        soup = BeautifulSoup(html, "lxml")

        main = soup.select_one("main")
        if not main:
            return None

        # "공고 소개" 섹션 이후 텍스트를 본문으로 사용
        full_text = main.get_text("\n", strip=True)
        content_text = self._extract_content(full_text)

        # 제목: h3 또는 목록에서 가져온 제목
        title = list_title
        h3 = main.select_one("h3")
        if h3:
            t = h3.get_text(strip=True)
            if t and len(t) >= 3:
                title = t

        if not title or len(title) < 3:
            return None

        if self.is_noise_title(title):
            return None

        # 메타 정보 추출 (키:값 패턴)
        company = self._extract_meta(full_text, ["제작사", "회사명"])
        deadline_text = self._extract_meta(full_text, ["모집기간"])

        # 마감일 파싱 — "2026.04.01 ~ 2026.06.30" 에서 종료일 추출
        deadline = None
        if deadline_text and "~" in deadline_text:
            end_part = deadline_text.split("~")[-1].strip()
            deadline = self.parse_deadline(end_part)
        elif deadline_text:
            deadline = self.parse_deadline(deadline_text)

        # 이메일 추출 — 사이트 자체 이메일(admin@castik.co.kr) 제외
        apply_email = self._extract_email_filtered(content_text) or self._extract_email_filtered(html)

        # 전화번호, 장소
        phone = self.extract_phone(content_text)
        location = self._extract_meta(content_text, ["진행지역"])

        # 장르 분류
        category = self._extract_meta(content_text, ["카테고리"]) or ""
        genre = self.classify_genre(title + " " + category + " " + content_text[:500])

        description = self.build_description(content_text, phone, location)

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
    def _extract_content(full_text: str) -> str:
        """'공고 소개' 이후 ~ '신고하기' 이전 구간을 본문으로 추출"""
        start = full_text.find("공고 소개")
        if start != -1:
            text = full_text[start:]
        else:
            # fallback: "카테고리" 부터
            start = full_text.find("카테고리")
            text = full_text[start:] if start != -1 else full_text

        # 푸터 노이즈 제거
        for marker in ["신고하기", "허위/사기/부적절한"]:
            end = text.find(marker)
            if end != -1:
                text = text[:end]

        return text.strip()

    def _extract_email_filtered(self, text: str) -> str | None:
        """이메일 추출 — castik.co.kr 도메인 제외"""
        import re

        pattern = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
        for match in re.finditer(pattern, text):
            email = match.group()
            lower = email.lower()
            # castik 사이트 자체 이메일 및 노이즈 제외
            noise = ("castik.co.kr", "example.com", "test.com", "noreply", "no-reply")
            if any(n in lower for n in noise):
                continue
            return email
        return None

    @staticmethod
    def _extract_meta(text: str, keywords: list[str]) -> str | None:
        """'키워드\\n값' 또는 '키워드: 값' 패턴에서 값 추출"""
        import re

        for kw in keywords:
            # "제작사/회사명\nRBW" 패턴 (줄바꿈 구분)
            pat = rf"{kw}\s*\n+\s*(.+)"
            match = re.search(pat, text)
            if match:
                val = match.group(1).strip()
                # 다음 키워드가 아닌 실제 값만 반환
                if val and len(val) > 0 and val != "-":
                    return val[:200]

            # "키워드: 값" 패턴
            pat = rf"{kw}\s*[:：]\s*(.+)"
            match = re.search(pat, text)
            if match:
                val = match.group(1).strip()
                if val and val != "-":
                    return val[:200]

        return None
