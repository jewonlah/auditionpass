"""
캐스트링크 (castlink.co.kr) 크롤러
React Server Components (RSC) 렌더링 — Playwright
상세 페이지 접근 불가 → 목록 카드에서 데이터 추출
"""

import re
import time
import logging
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout
from .base import BaseScraper, AuditionData

logger = logging.getLogger(__name__)


class CastlinkScraper(BaseScraper):
    source_name = "캐스트링크"
    base_url = "https://castlink.co.kr"
    list_url = "https://castlink.co.kr/ko/service/auditions"

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

            time.sleep(2)

            # DOM에서 카드 데이터 일괄 추출
            cards_data = page.evaluate('''() => {
                const grid = document.querySelector('.grid');
                if (!grid) return [];
                return Array.from(grid.children).map((card, idx) => {
                    const titleEl = card.querySelector('p.text-lg') || card.querySelector('p.text-xl');
                    const genreEl = card.querySelector('p.text-sm');
                    const ddayEl = card.querySelector('.font-bold p');
                    const badges = Array.from(card.querySelectorAll('.text-xs'))
                        .map(b => b.textContent.trim());
                    const imgEl = card.querySelector('img');
                    return {
                        index: idx,
                        title: titleEl ? titleEl.textContent.trim() : '',
                        genre: genreEl ? genreEl.textContent.trim() : '',
                        dday: ddayEl ? ddayEl.textContent.trim() : '',
                        badges: badges,
                        channel: imgEl ? imgEl.alt.replace(' logo', '') : '',
                        allText: card.textContent.trim(),
                    };
                });
            }''')

            browser.close()

        logger.info(f"[{self.source_name}] 목록에서 {len(cards_data)}개 항목 발견")

        for card in cards_data:
            try:
                audition = self._parse_card_data(card)
                if audition:
                    results.append(audition)
            except Exception as e:
                logger.warning(f"[{self.source_name}] 카드 파싱 오류: {e}")
                continue

        return results

    def _parse_card_data(self, card: dict) -> AuditionData | None:
        title = card.get("title", "")
        if not title or len(title) < 3:
            return None
        if self.is_noise_title(title):
            return None

        # 장르
        genre_text = card.get("genre", "") + " " + title
        genre = self.classify_genre(genre_text)

        # D-day → deadline 계산
        deadline = self._parse_dday(card.get("dday", ""))

        # 성별/나이 배지 → description 조합
        badges = card.get("badges", [])
        channel = card.get("channel", "")
        desc_parts = []
        if channel:
            desc_parts.append(f"채널: {channel}")
        if card.get("genre"):
            desc_parts.append(f"장르: {card['genre']}")
        for badge in badges:
            if "세" in badge:
                desc_parts.append(f"나이: {badge}")
            elif badge in ("남성", "여성", "남녀"):
                desc_parts.append(f"성별: {badge}")
        description = "\n".join(desc_parts) if desc_parts else None

        # source_url: 상세 페이지 없으므로 목록 URL + 인덱스로 unique 생성
        source_url = f"{self.list_url}#card-{card.get('index', 0)}-{title[:30]}"

        return AuditionData(
            title=title,
            company=channel or None,
            genre=genre,
            deadline=deadline,
            apply_email=None,
            description=description,
            requirements=None,
            source_url=source_url,
            source_name=self.source_name,
        )

    @staticmethod
    def _parse_dday(dday_text: str):
        """D-7 형식의 텍스트를 date로 변환"""
        if not dday_text:
            return None
        match = re.search(r"D-(\d+)", dday_text)
        if match:
            days = int(match.group(1))
            return date.today() + timedelta(days=days)
        if "오늘" in dday_text or "D-0" in dday_text or "D-Day" in dday_text.replace(" ", ""):
            return date.today()
        return None
