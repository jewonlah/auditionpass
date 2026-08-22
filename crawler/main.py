"""
오디션패스 크롤러 — 매일 새벽 3시(KST) 실행
오디션 공고를 수집하여 Supabase에 저장
"""

import sys
import time
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
from scrapers.generic_board import all_scrapers as all_board_scrapers
from sns_sources.naver_cafe import NaverCafeScraper
from sns_sources.naver_web import NaverWebScraper
from utils import crawl_log
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
# supabase/httpx의 요청 단위 INFO 로그(수천 줄) 억제 — 로컬 로그 파일 가독성
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


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
    # 범용 게시판 (플랜 E-4): 콘테스트코리아·국립극단·이벤트넷·플레이DB — 신규 출처는 검수 큐(pending)로 들어감
    scrapers.extend(all_board_scrapers())
    # 트랙 A-1 네이버 카페 (31 §3) — NAVER_CAFE_ENABLED=1 + API HUB 키가 있을 때만 (검수 전 라이브 오염 방지)
    if NaverCafeScraper.enabled():
        scrapers.append(NaverCafeScraper())
        scrapers.append(NaverWebScraper("webkr"))   # 홈페이지 공고 + 도메인 발견 큐 (플랜 E-3)
        scrapers.append(NaverWebScraper("blog"))
    else:
        logger.info("[네이버카페] 비활성 (NAVER_CAFE_ENABLED≠1 또는 키 없음) — 건너뜀")

    total_collected = 0
    total_saved = 0
    errors = []

    for scraper in scrapers:
        logger.info(f"[{scraper.source_name}] 수집 시작...")
        t0 = time.monotonic()
        try:
            auditions = scraper.scrape()
            collected = len(auditions)
            total_collected += collected
            logger.info(f"[{scraper.source_name}] {collected}건 수집")

            # 마감된 공고 필터링
            before = len(auditions)
            auditions = filter_expired(auditions, scraper.source_name)
            expired = before - len(auditions)

            saved = 0
            st = {"keyword": 0, "rule": 0, "ai": 0, "etc": 0, "low_confidence": 0}
            if auditions:
                saved = upsert_auditions(auditions)
                total_saved += saved
                logger.info(f"[{scraper.source_name}] {saved}건 저장 완료")
                # 분류 통계 (2-1)
                st = pop_classify_stats()
                logger.info(
                    f"[{scraper.source_name}] 분류: keyword {st['keyword']} / rule {st['rule']} / "
                    f"기타 {st['etc']} / 저확신(<0.6) {st['low_confidence']}"
                )
            else:
                logger.warning(f"[{scraper.source_name}] 수집된 공고 없음")

            # 발견 큐(source_candidates) — 웹문서·SNS 검색이 찾은 도메인/계정 후보 적립
            if hasattr(scraper, "push_candidates"):
                try:
                    n_c = scraper.push_candidates()
                    if n_c:
                        logger.info(f"[{scraper.source_name}] 출처 후보 {n_c}건 기록 (tools/review.py candidates)")
                except Exception as e:
                    logger.warning(f"[{scraper.source_name}] 후보 기록 실패: {e}")

            # crawl_logs 실기록 (2-4) — 세부 통계(details)는 스크레이퍼가 제공하면 포함(네이버카페: 키워드·카페 수율)
            crawl_log.record(
                scraper.source_name, collected=collected, saved=saved, expired=expired,
                dups=max(0, len(auditions) - saved), by_keyword=st["keyword"], by_rule=st["rule"], by_ai=st["ai"],
                duration=round(time.monotonic() - t0, 1), details=getattr(scraper, "details", None),
            )

        except Exception as e:
            logger.error(f"[{scraper.source_name}] 크롤링 실패: {e}")
            errors.append(f"{scraper.source_name}: {e}")
            crawl_log.record(scraper.source_name, collected=0, saved=0, errors=str(e)[:500],
                             duration=round(time.monotonic() - t0, 1))
            continue

    # 소스 생존 경보 (최근 3일 저장 0건) — 4개월 동안 모르고 지나간 필메코·캐스트링크 사례 방지
    dead = crawl_log.recent_zero_days(days=3)
    if dead:
        logger.warning(f"⚠ 최근 3일 신규 저장 0건 소스: {', '.join(dead)}")

    # 마감 공고 비활성화
    logger.info("마감 공고 비활성화 처리...")
    deactivated = deactivate_expired()
    deactivated += deactivate_stale_undated(days=45)                          # 전 소스: 마감 미상 45일 만료 (좀비 방지)
    deactivated += deactivate_stale_undated(days=30, source_prefix="네이버카페")  # 검색형은 30일

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
