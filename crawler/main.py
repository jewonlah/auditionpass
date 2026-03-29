"""
오디션패스 크롤러 — 매일 새벽 3시(KST) 실행
오디션 공고를 수집하여 Supabase에 저장
"""

import sys
import logging
from pathlib import Path
from dotenv import load_dotenv
from scrapers.plfil import PlfilScraper
from scrapers.megaphone import MegaphoneScraper
from scrapers.otr import OtrScraper
from scrapers.vaudition import VauditionScraper
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


def main():
    logger.info("========== 크롤러 시작 ==========")

    scrapers = [
        PlfilScraper(),          # 1. plfil.com — SSR
        MegaphoneScraper(),      # 2. megaphonekorea.com — SSR
        OtrScraper(),            # 3. otr.co.kr — Playwright
        VauditionScraper(),      # 4. vaudition.com — Playwright
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
