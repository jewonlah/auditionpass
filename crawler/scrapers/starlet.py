"""
스타렛 스튜디오 (starlet-studio.co.kr) 크롤러
서버사이드 렌더링 — requests + BeautifulSoup
URL 패턴:
  목록: /audition?pageNo=N
  상세: /audition/detail/?auditionIdx=XXXX
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

_LIST_URL = "https://www.starlet-studio.co.kr/audition"
_DETAIL_URL = "https://www.starlet-studio.co.kr/audition/detail/"
_MAX_PAGES = 3


class StarletScraper(BaseScraper):
    source_name = "스타렛스튜디오"
    base_url = "https://www.starlet-studio.co.kr"

    def scrape(self) -> list[AuditionData]:
        results: list[AuditionData] = []
        seen_idx: set[str] = set()

        for page_num in range(1, _MAX_PAGES + 1):
            try:
                resp = requests.get(
                    _LIST_URL,
                    params={"pageNo": page_num},
                    timeout=30,
                    headers=_HEADERS,
                )
                resp.raise_for_status()
            except requests.RequestException as e:
                logger.error(
                    f"[{self.source_name}] 목록 요청 실패 (page {page_num}): {e}"
                )
                continue

            soup = BeautifulSoup(resp.text, "lxml")
            links = soup.select("a[href*='auditionIdx=']")

            page_idxs: list[str] = []
            for link in links:
                href = link.get("href", "")
                m = re.search(r"auditionIdx=(\d+)", href)
                if not m:
                    continue
                idx = m.group(1)
                if idx in seen_idx:
                    continue
                seen_idx.add(idx)
                page_idxs.append(idx)

            if not page_idxs:
                logger.info(
                    f"[{self.source_name}] page {page_num} 항목 없음 — 중단"
                )
                break

            logger.info(
                f"[{self.source_name}] page {page_num}: {len(page_idxs)}개 발견"
            )

            for idx in page_idxs:
                url = f"{_DETAIL_URL}?auditionIdx={idx}"
                try:
                    audition = self._fetch_detail(url)
                    if audition:
                        results.append(audition)
                    time.sleep(0.4)
                except Exception as e:
                    logger.warning(
                        f"[{self.source_name}] 상세 파싱 오류 ({url}): {e}"
                    )
                    continue

        return results

    def _fetch_detail(self, url: str) -> AuditionData | None:
        try:
            resp = requests.get(url, timeout=30, headers=_HEADERS)
            resp.raise_for_status()
        except requests.RequestException:
            return None

        soup = BeautifulSoup(resp.text, "lxml")

        body_el = soup.select_one("main, article, .content, #content, body")
        full_text = body_el.get_text("\n", strip=True) if body_el else ""
        if not full_text:
            return None

        # 제목 — h1/h2/h3 우선
        title = ""
        for sel in ("h1", "h2", "h3"):
            el = soup.select_one(sel)
            if el:
                t = el.get_text(strip=True)
                if t and len(t) >= 5:
                    title = t
                    break

        if not title or self.is_noise_title(title):
            return None

        company = self._extract_label(full_text, ["제작사", "회사명"])
        recruit_text = self._extract_label(full_text, ["모집기간", "접수기간"])
        roles = self._extract_label(full_text, ["모집배역", "모집부문"])
        apply_method = self._extract_label(full_text, ["지원방법"])

        # 마감일 — "2024.11.22 ~ 2024.12.15" 종료일 추출
        deadline = None
        if recruit_text and "~" in recruit_text:
            end_part = recruit_text.split("~")[-1].strip()
            deadline = self.parse_deadline(end_part)
        elif recruit_text:
            deadline = self.parse_deadline(recruit_text)

        apply_email = self.extract_email(full_text) or self.extract_email(resp.text)
        phone = self.extract_phone(full_text)
        location = self.extract_location(full_text)

        genre = self.classify_genre(
            title + " " + (roles or "") + " " + full_text[:500]
        )

        description = self.build_description(full_text, phone, location)

        return AuditionData(
            title=title,
            company=company,
            genre=genre,
            deadline=deadline,
            apply_email=apply_email,
            description=description,
            requirements=roles or apply_method,
            source_url=url,
            source_name=self.source_name,
        )

    @staticmethod
    def _extract_label(text: str, keywords: list[str]) -> str | None:
        """'라벨 :' 또는 '라벨 :\\n값' 패턴에서 값 추출"""
        for kw in keywords:
            # "라벨 : 값" — 같은 줄
            pat = rf"{kw}\s*[:：]\s*([^\n]+)"
            m = re.search(pat, text)
            if m:
                val = m.group(1).strip()
                if val and val != "-":
                    return val[:200]
            # "라벨\n값" — 다음 줄
            pat = rf"{kw}\s*\n+\s*([^\n]+)"
            m = re.search(pat, text)
            if m:
                val = m.group(1).strip()
                if val and val != "-":
                    return val[:200]
        return None
