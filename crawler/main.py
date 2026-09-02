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
from scrapers.castlink import CastlinkScraper
from scrapers.filmmakers import FilmmakersScraper
from scrapers.casting114 import Casting114Scraper
from scrapers.castingnara import CastingnaraScraper
from scrapers.castik import CastikScraper
from scrapers.starlet import StarletScraper
from scrapers.generic_board import all_scrapers as all_board_scrapers
from scrapers.official_pages import OfficialPagesScraper
from sns_sources.backtrace import BacktraceScraper
from sns_sources.naver_cafe import NaverCafeScraper
from sns_sources.naver_web import NaverWebScraper
from utils import crawl_log
from utils.alerts import notify_dead_sources
from utils.supabase_client import (
    upsert_auditions,
    expire_auditions,
    archive_old_auditions,
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

# 예외로 죽은 스크레이퍼가 이 비율 이상이면 실행을 실패로 본다 (2-4)
FAIL_RATIO = 0.5
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
        MegaphoneScraper(),      # 2. megaphonekorea.com — SSR (HTTP, 명시적 셀렉터 2-5)
        OtrScraper(),            # 2. otr.co.kr — Playwright
        # V오디션(vaudition.com) 제외 — 2026-08-27 실측: 상세가 로그인 벽("프로필작성자만 볼수 있어요").
        # 32 §3 "로그인 벽 미접근" 규칙상 열 수 없고, 유저가 원문 링크를 눌러도 같은 벽을 만난다.
        # 목록에 있는 날짜도 마감이 아니라 "오디션 진행일"이라 정보 가치가 낮다. scrapers/vaudition.py는 남겨둔다.
        CastlinkScraper(),       # 4. castlink.co.kr — RSC 페이로드 직접 파싱(2-5)
        FilmmakersScraper(),     # 6. filmmakers.co.kr — SSR (재시도 로직 추가)
        Casting114Scraper(),     # 5. casting114.com — JSON API
        CastingnaraScraper(),    # 6. castingnara.com — SSR (PHP)
        CastikScraper(),         # 7. castik.co.kr — Playwright
        StarletScraper(),        # 8. starlet-studio.co.kr — SSR
    ]
    # 범용 게시판 (플랜 E-4): 콘테스트코리아·국립극단·이벤트넷·플레이DB — 신규 출처는 검수 큐(pending)로 들어감
    scrapers.extend(all_board_scrapers())
    # 기획사·공공 공식 페이지 변경 감시 (플랜 E-5, D4 지정 소스)
    scrapers.append(OfficialPagesScraper())
    # 트랙 A-1 네이버 카페 (31 §3) — NAVER_CAFE_ENABLED=1 + API HUB 키가 있을 때만 (검수 전 라이브 오염 방지)
    if NaverCafeScraper.enabled():
        scrapers.append(NaverCafeScraper())
        scrapers.append(NaverWebScraper("webkr"))   # 홈페이지 공고 + 도메인 발견 큐 (플랜 E-3)
        scrapers.append(NaverWebScraper("blog"))
        scrapers.append(BacktraceScraper())            # 애그리게이터 링크 역추적 (플랜 E-7, 저장은 원글만)
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
    # "이번 실행에 돌았는가"(active_names)로 판단하면 조건부 스크레이퍼(NAVER_CAFE_ENABLED)가
    # 빠질 때 그 소스 경보가 같이 꺼지고, 별도 실행 엔트리(run_social.ps1)는 어떤 실행에도
    # 안 잡혀 영영 경보가 안 나간다. 대신 dead_sources()의 명시적 retired_names(기본
    # crawl_log.RETIRED_SOURCES)로 진짜 퇴역 소스(예: V오디션)만 뺀다(적대적 리뷰 2026-09).
    dead, never = crawl_log.dead_sources(days=3)
    if dead:
        logger.error(f"⚠ 소스 사망 의심 — 최근 30일엔 저장했는데 3일째 0건: {', '.join(dead)}")
        notify_dead_sources(dead, never)
    if never:
        logger.info(f"  (참고) 30일간 저장 0건인 소스: {', '.join(never)}")

    # 마감 공고 비활성화
    logger.info("마감 공고 비활성화 처리...")
    # 만료 판정은 DB 함수 하나(018)로 일원화 — 규칙이 흩어져 ingest 경로가 누락됐던 결함(2-4)
    deactivated = sum(expire_auditions().values())
    # 지난 지 30일 넘은 공고는 본문만 비운다(019) — 삭제하면 지원·신고 이력이 cascade로 사라지고
    # source_url이 없어져 같은 공고가 되살아난다. pg_cron도 매일 돌지만 멱등이라 무해.
    archive_old_auditions(30)

    logger.info("========== 크롤러 완료 ==========")
    logger.info(f"  수집: {total_collected}건 / 저장: {total_saved}건 / 비활성화: {deactivated}건")

    if errors:
        logger.warning(f"  오류 발생 사이트: {len(errors)}개")
        for err in errors:
            logger.warning(f"    - {err}")

    # 실패 판정: "전부 실패"만 잡으면 1개만 성공해도 초록불이라 부분 장애를 4개월 놓친다(2-4).
    # 절반 이상이 예외로 죽으면 실패로 본다.
    if errors and len(errors) == len(scrapers):
        logger.error("모든 크롤러가 실패했습니다.")
        sys.exit(1)
    if len(errors) >= max(2, round(len(scrapers) * FAIL_RATIO)):
        logger.error(f"크롤러 {len(errors)}/{len(scrapers)}개 실패 — 임계치({FAIL_RATIO:.0%}) 초과")
        sys.exit(1)


if __name__ == "__main__":
    main()
