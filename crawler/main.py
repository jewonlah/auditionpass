"""
오디션패스 크롤러 — 매일 새벽 3시(KST) 실행
오디션 공고를 수집하여 Supabase에 저장
"""

import sys
import logging
from datetime import date
from pathlib import Path
from dotenv import load_dotenv
from scrapers.plfil import PlfilScraper
from scrapers.megaphone import MegaphoneScraper
from scrapers.otr import OtrScraper
from scrapers.vaudition import VauditionScraper
from scrapers.castlink import CastlinkScraper
from scrapers.filmmakers import FilmmakersScraper
from scrapers.casting114 import Casting114Scraper
from scrapers.castingnara import CastingnaraScraper
from scrapers.castik import CastikScraper
from scrapers.starlet import StarletScraper
from sns_sources.naver_cafe import NaverCafeScraper
from utils.supabase_client import (
    upsert_auditions,
    deactivate_expired,
    deactivate_stale_undated,
    pop_classify_stats,
)

# crawler/.env 로드
load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def filter_expired(auditions, source_name: str):
    """마감된 공고 제외 (deadline이 오늘 이전이면 스킵, deadline 없으면 포함)"""
    today = date.today()
    filtered = []
    skipped = 0
    for a in auditions:
        if a.deadline and a.deadline < today:
            skipped += 1
            continue
        filtered.append(a)
    if skipped:
        logger.info(f"[{source_name}] 마감 공고 {skipped}건 제외")
    return filtered


def main():
    logger.info("========== 크롤러 시작 ==========")

    scrapers = [
        PlfilScraper(),          # 1. plfil.com — SSR
        MegaphoneScraper(),      # 2. megaphonekorea.com — SSR (HTTP)
        OtrScraper(),            # 2. otr.co.kr — Playwright
        VauditionScraper(),      # 3. vaudition.com — Playwright
        CastlinkScraper(),       # 4. castlink.co.kr — Playwright
        FilmmakersScraper(),     # 6. filmmakers.co.kr — SSR (재시도 로직 추가)
        Casting114Scraper(),     # 5. casting114.com — JSON API
        CastingnaraScraper(),    # 6. castingnara.com — SSR (PHP)
        CastikScraper(),         # 7. castik.co.kr — Playwright
        StarletScraper(),        # 8. starlet-studio.co.kr — SSR
    ]
    # 트랙 A-1 네이버 카페 (31 §3) — NAVER_CAFE_ENABLED=1 + API HUB 키가 있을 때만 (검수 전 라이브 오염 방지)
    if NaverCafeScraper.enabled():
        scrapers.append(NaverCafeScraper())
    else:
        logger.info("[네이버카페] 비활성 (NAVER_CAFE_ENABLED≠1 또는 키 없음) — 건너뜀")

    total_collected = 0
    total_saved = 0
    errors = []

    for scraper in scrapers:
        logger.info(f"[{scraper.source_name}] 수집 시작...")
        try:
            auditions = scraper.scrape()
            collected = len(auditions)
            total_collected += collected
            logger.info(f"[{scraper.source_name}] {collected}건 수집")

            # 마감된 공고 필터링
            auditions = filter_expired(auditions, scraper.source_name)

            if auditions:
                saved = upsert_auditions(auditions)
                total_saved += saved
                logger.info(f"[{scraper.source_name}] {saved}건 저장 완료")
                # 분류 통계 (2-1) — 2-4 crawl_logs 기록 시 그대로 컬럼에 매핑
                st = pop_classify_stats()
                logger.info(
                    f"[{scraper.source_name}] 분류: keyword {st['keyword']} / rule {st['rule']} / "
                    f"기타 {st['etc']} / 저확신(<0.6) {st['low_confidence']}"
                )
            else:
                logger.warning(f"[{scraper.source_name}] 수집된 공고 없음")

        except Exception as e:
            logger.error(f"[{scraper.source_name}] 크롤링 실패: {e}")
            errors.append(f"{scraper.source_name}: {e}")
            continue

    # 마감 공고 비활성화
    logger.info("마감 공고 비활성화 처리...")
    deactivated = deactivate_expired()
    deactivated += deactivate_stale_undated(days=30)  # 마감일 미상 네이버카페 공고 30일 만료

    logger.info("========== 크롤러 완료 ==========")
    logger.info(f"  수집: {total_collected}건 / 저장: {total_saved}건 / 비활성화: {deactivated}건")

    if errors:
        logger.warning(f"  오류 발생 사이트: {len(errors)}개")
        for err in errors:
            logger.warning(f"    - {err}")

    if len(errors) == len(scrapers):
        logger.error("모든 크롤러가 실패했습니다.")
        sys.exit(1)


if __name__ == "__main__":
    main()
