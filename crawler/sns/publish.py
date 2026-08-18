"""
SNS 통합 퍼블리셔
— 생성된 콘텐츠(이미지+캡션)를 모든 SNS 플랫폼에 자동 게시
— 파이프라인: 이미지 → Supabase Storage 업로드 → Instagram + Threads 동시 게시

사용법:
  python -m sns.publish                          # output/ 폴더의 오늘 콘텐츠 전체 게시
  python -m sns.publish --date 2026-04-05        # 특정 날짜 콘텐츠 게시
  python -m sns.publish --type top5              # 특정 타입만 게시
  python -m sns.publish --platform instagram     # 특정 플랫폼만
"""

import sys
import logging
import argparse
from pathlib import Path
from datetime import date

from sns.storage import upload_image
from sns.instagram_api import publish_photo as ig_publish
from sns.threads_api import publish_image as threads_publish

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent / "instagram" / "output"

CONTENT_TYPES = ["top5", "deadline", "weekly"]


def find_content(target_date: str, content_type: str | None = None):
    """output 디렉토리에서 해당 날짜의 콘텐츠(이미지+캡션) 쌍을 찾는다."""
    types = [content_type] if content_type else CONTENT_TYPES
    results = []

    for ctype in types:
        image_path = OUTPUT_DIR / f"{ctype}_{target_date}.png"
        caption_path = OUTPUT_DIR / f"{ctype}_{target_date}_caption.txt"

        if image_path.exists() and caption_path.exists():
            caption = caption_path.read_text(encoding="utf-8")
            results.append({
                "type": ctype,
                "image_path": image_path,
                "caption": caption,
            })
        else:
            logger.debug(f"[{ctype}] {target_date} 콘텐츠 없음")

    return results


def publish_to_all(content: dict, platforms: list[str] | None = None):
    """
    단일 콘텐츠를 모든 (또는 지정된) 플랫폼에 게시.
    1) Supabase Storage에 이미지 업로드 → 공개 URL 확보
    2) 각 플랫폼 API로 게시
    """
    targets = platforms or ["instagram", "threads"]
    results = []

    # 이미지 업로드
    logger.info(f"[{content['type']}] 이미지 업로드 중...")
    try:
        image_url = upload_image(content["image_path"])
    except Exception as e:
        logger.error(f"[{content['type']}] 이미지 업로드 실패: {e}")
        return results

    # 각 플랫폼에 게시
    if "instagram" in targets:
        try:
            result = ig_publish(image_url, content["caption"])
            if result:
                results.append(result)
        except Exception as e:
            logger.error(f"[Instagram] 게시 실패: {e}")

    if "threads" in targets:
        try:
            result = threads_publish(image_url, content["caption"])
            if result:
                results.append(result)
        except Exception as e:
            logger.error(f"[Threads] 게시 실패: {e}")

    return results


def main():
    parser = argparse.ArgumentParser(description="SNS 자동 게시")
    parser.add_argument("--date", default=str(date.today()),
                        help="게시할 콘텐츠 날짜 (YYYY-MM-DD)")
    parser.add_argument("--type", choices=CONTENT_TYPES,
                        help="특정 콘텐츠 타입만 게시")
    parser.add_argument("--platform", choices=["instagram", "threads"],
                        help="특정 플랫폼만 게시")
    args = parser.parse_args()

    platforms = [args.platform] if args.platform else None

    logger.info(f"===== SNS 자동 게시 ({args.date}) =====")

    contents = find_content(args.date, args.type)
    if not contents:
        logger.warning("게시할 콘텐츠가 없습니다")
        sys.exit(0)

    total_results = []
    for content in contents:
        logger.info(f"[{content['type']}] 게시 시작...")
        results = publish_to_all(content, platforms)
        total_results.extend(results)
        logger.info(f"[{content['type']}] {len(results)}개 플랫폼 게시 완료")

    logger.info(f"===== 전체 완료: {len(total_results)}건 게시 =====")

    # 실패 건이 있으면 exit code 1
    expected = len(contents) * len(platforms or ["instagram", "threads"])
    if len(total_results) < expected:
        logger.warning(f"일부 게시 실패: {len(total_results)}/{expected}")


if __name__ == "__main__":
    main()
