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
from utils.supabase_client import upsert_auditions, deactivate_expired
from utils.refine_description import refine_description

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
        # MegaphoneScraper(),    # 비활성화: SSL 인증서 만료 (2026-04-03 확인)
        OtrScraper(),            # 2. otr.co.kr — Playwright
        VauditionScraper(),      # 3. vaudition.com — Playwright
        CastlinkScraper(),       # 4. castlink.co.kr — Playwright
        # FilmmakersScraper(),   # 비활성화: 사이트 접속 타임아웃 (2026-04-03 확인)
        Casting114Scraper(),     # 5. casting114.com — JSON API
        CastingnaraScraper(),    # 6. castingnara.com — SSR (PHP)
        CastikScraper(),         # 7. castik.co.kr — Playwright
    ]

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

            # Claude API로 description 정제
            for audition in auditions:
                if audition.description:
                    audition.description = refine_description(
                        audition.description, audition.title
                    )

            if auditions:
                saved = upsert_auditions(auditions)
                total_saved += saved
                logger.info(f"[{scraper.source_name}] {saved}건 저장 완료")
            else:
                logger.warning(f"[{scraper.source_name}] 수집된 공고 없음")

        except Exception as e:
            logger.error(f"[{scraper.source_name}] 크롤링 실패: {e}")
            errors.append(f"{scraper.source_name}: {e}")
            continue

    # 마감 공고 비활성화
    logger.info("마감 공고 비활성화 처리...")
    deactivated = deactivate_expired()

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
