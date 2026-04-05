"""
인스타그램 콘텐츠 일괄 생성 — 매일 실행
사용법: python generate.py [--type top5|deadline|weekly|all]
"""

import sys
import logging
from pathlib import Path
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


def main():
    content_type = sys.argv[1] if len(sys.argv) > 1 else "all"
    content_type = content_type.lstrip("-").lstrip("-").replace("type=", "")

    logger.info(f"===== 인스타 콘텐츠 생성 ({content_type}) =====")

    if content_type in ("top5", "all"):
        gen_top5()
    if content_type in ("deadline", "all"):
        gen_deadline()
    if content_type in ("weekly", "all"):
        gen_weekly()

    logger.info("===== 완료 =====")


if __name__ == "__main__":
    main()
