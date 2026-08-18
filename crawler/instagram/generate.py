"""
인스타그램 콘텐츠 일괄 생성 + SNS 자동 게시
사용법:
  python generate.py [--type top5|deadline|weekly|all] [--publish] [--platform instagram|threads]
"""

import sys
import os
import logging
import argparse
from pathlib import Path

# sns 모듈 import를 위해 crawler 루트를 path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from card_top5 import fetch_top5, generate_top5_card, generate_top5_caption
from card_deadline import fetch_deadline_soon, generate_deadline_card, generate_deadline_caption
from card_weekly import fetch_weekly_stats, generate_weekly_card, generate_weekly_caption

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent / "output"


def save_caption(filename: str, caption: str):
    path = OUTPUT_DIR / filename
    path.write_text(caption, encoding="utf-8")
    logger.info(f"캡션 저장: {path}")


def gen_top5():
    logger.info("[TOP5] 생성 중...")
    data = fetch_top5()
    if data:
        card = generate_top5_card(data)
        save_caption(card.stem + "_caption.txt", generate_top5_caption(data))
        logger.info(f"[TOP5] 완료 — {card.name}")
    else:
        logger.warning("[TOP5] 데이터 없음")


def gen_deadline():
    logger.info("[마감임박] 생성 중...")
    data = fetch_deadline_soon()
    if data:
        card = generate_deadline_card(data)
        if card:
            save_caption(card.stem + "_caption.txt", generate_deadline_caption(data))
            logger.info(f"[마감임박] 완료 — {card.name}")
    else:
        logger.info("[마감임박] 해당 공고 없음")


def gen_weekly():
    logger.info("[주간통계] 생성 중...")
    stats = fetch_weekly_stats()
    card = generate_weekly_card(stats)
    save_caption(card.stem + "_caption.txt", generate_weekly_caption(stats))
    logger.info(f"[주간통계] 완료 — {card.name}")


def auto_publish(content_type: str, platform: str | None = None):
    """생성된 콘텐츠를 SNS에 자동 게시."""
    from sns.publish import find_content, publish_to_all
    from datetime import date

    today = str(date.today())
    platforms = [platform] if platform else None
    type_filter = None if content_type == "all" else content_type

    contents = find_content(today, type_filter)
    if not contents:
        logger.warning("게시할 콘텐츠 없음")
        return

    for content in contents:
        logger.info(f"[자동게시] {content['type']} → SNS 게시 중...")
        results = publish_to_all(content, platforms)
        logger.info(f"[자동게시] {content['type']} → {len(results)}개 플랫폼 완료")


def main():
    parser = argparse.ArgumentParser(description="인스타 콘텐츠 생성 + SNS 자동 게시")
    parser.add_argument("--type", default="all",
                        choices=["top5", "deadline", "weekly", "all"],
                        help="생성할 콘텐츠 타입")
    parser.add_argument("--publish", action="store_true",
                        help="생성 후 SNS에 자동 게시")
    parser.add_argument("--platform", choices=["instagram", "threads"],
                        help="특정 플랫폼만 게시")
    args = parser.parse_args()

    logger.info(f"===== 인스타 콘텐츠 생성 ({args.type}) =====")

    if args.type in ("top5", "all"):
        gen_top5()
    if args.type in ("deadline", "all"):
        gen_deadline()
    if args.type in ("weekly", "all"):
        gen_weekly()

    logger.info("===== 생성 완료 =====")

    if args.publish:
        logger.info("===== SNS 자동 게시 시작 =====")
        auto_publish(args.type, args.platform)
        logger.info("===== 자동 게시 완료 =====")


if __name__ == "__main__":
    main()
