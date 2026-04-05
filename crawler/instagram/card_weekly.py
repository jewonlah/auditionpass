"""
주간 오디션 통계 — 인스타 카드 생성기
이번 주 신규 공고 수, 장르별 분포, 원클릭 지원 비율 등
"""

import os
import logging
from datetime import date, timedelta
from pathlib import Path
from collections import Counter
from PIL import Image, ImageDraw
from dotenv import load_dotenv
from supabase import create_client
from brand import (
    PRIMARY, PRIMARY_DARK, PRIMARY_LIGHT, WHITE, GRAY_50, GRAY_100,
    GRAY_300, GRAY_500, GRAY_700, GRAY_900, SUCCESS, WARNING, DANGER,
    ACCENT, WIDTH, HEIGHT, OUTPUT_DIR,
    hex_to_rgb, get_font, draw_pill_badge, draw_brand_footer,
)

load_dotenv(Path(__file__).parent.parent / ".env")
logger = logging.getLogger(__name__)


def fetch_weekly_stats() -> dict:
    """이번 주 통계 데이터 조회"""
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    week_ago = (date.today() - timedelta(days=7)).isoformat()
    today = date.today().isoformat()

    # 이번 주 활성 공고 전체
    all_active = (
        sb.table("auditions")
        .select("genre,apply_type,source_name")
        .eq("is_active", True)
        .or_(f"deadline.gte.{today},deadline.is.null")
        .execute()
    )
    rows = all_active.data or []

    genre_counts = Counter(r["genre"] for r in rows)
    type_counts = Counter(r["apply_type"] for r in rows)
    total = len(rows)

    return {
        "total": total,
        "email_count": type_counts.get("email", 0),
        "external_count": type_counts.get("external", 0),
        "genres": dict(genre_counts.most_common(5)),
        "week_start": (date.today() - timedelta(days=6)).strftime("%m.%d"),
        "week_end": date.today().strftime("%m.%d"),
    }


def generate_weekly_card(stats: dict | None = None) -> Path:
    if stats is None:
        stats = fetch_weekly_stats()

    img = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(WHITE))
    draw = ImageDraw.Draw(img)

    f_hook = get_font(42, bold=True)
    f_title = get_font(54, bold=True)
    f_date = get_font(26)
    f_big_num = get_font(80, bold=True)
    f_label = get_font(28)
    f_stat_num = get_font(48, bold=True)
    f_stat_label = get_font(24)
    f_genre = get_font(28, bold=True)
    f_genre_num = get_font(28)
    f_badge = get_font(22, bold=True)

    # ── 헤더 ──
    draw.rectangle([(0, 0), (WIDTH, 280)], fill=hex_to_rgb(PRIMARY_DARK))
    draw.ellipse([(WIDTH - 200, -80), (WIDTH + 80, 200)], fill=hex_to_rgb(PRIMARY))

    draw.text((60, 35), "이번 주 오디션 리포트", fill=(*hex_to_rgb(WHITE), 200), font=f_hook)
    draw.text((60, 95), "WEEKLY REPORT", fill=hex_to_rgb(WHITE), font=f_title)
    draw.text((60, 180), f"{stats['week_start']} ~ {stats['week_end']}", fill=hex_to_rgb(PRIMARY_LIGHT), font=f_date)

    # ── 메인 숫자 (총 공고 수) ──
    y = 320
    draw.rounded_rectangle([(40, y), (WIDTH - 40, y + 200)], radius=20, fill=hex_to_rgb(GRAY_50))

    total_text = str(stats["total"])
    draw.text((80, y + 20), total_text, fill=hex_to_rgb(PRIMARY), font=f_big_num)
    bbox = draw.textbbox((80, y + 20), total_text, font=f_big_num)
    draw.text((bbox[2] + 15, y + 55), "건", fill=hex_to_rgb(GRAY_700), font=f_label)

    draw.text((80, y + 130), "현재 지원 가능한 오디션", fill=hex_to_rgb(GRAY_500), font=f_label)

    # ── 원클릭 vs 사이트 지원 ──
    y += 230
    box_w = (WIDTH - 40 * 2 - 20) // 2

    # 원클릭 지원
    draw.rounded_rectangle([(40, y), (40 + box_w, y + 160)], radius=16, fill=hex_to_rgb("#ECFDF5"))
    draw.text((70, y + 20), str(stats["email_count"]), fill=hex_to_rgb(SUCCESS), font=f_stat_num)
    draw.text((70, y + 90), "원클릭 지원", fill=hex_to_rgb(GRAY_700), font=f_stat_label)
    draw.text((70, y + 120), "버튼 하나로 지원 완료", fill=hex_to_rgb(GRAY_500), font=f_stat_label)

    # 사이트 지원
    x2 = 40 + box_w + 20
    draw.rounded_rectangle([(x2, y), (x2 + box_w, y + 160)], radius=16, fill=hex_to_rgb(GRAY_50))
    draw.text((x2 + 30, y + 20), str(stats["external_count"]), fill=hex_to_rgb(GRAY_700), font=f_stat_num)
    draw.text((x2 + 30, y + 90), "사이트 지원", fill=hex_to_rgb(GRAY_700), font=f_stat_label)
    draw.text((x2 + 30, y + 120), "외부 사이트에서 지원", fill=hex_to_rgb(GRAY_500), font=f_stat_label)

    # ── 장르별 분포 ──
    y += 195
    draw.text((60, y), "장르별 현황", fill=hex_to_rgb(GRAY_900), font=f_genre)
    y += 50

    bar_colors = [PRIMARY, ACCENT, SUCCESS, WARNING, GRAY_500]
    max_val = max(stats["genres"].values()) if stats["genres"] else 1

    for i, (genre, count) in enumerate(stats["genres"].items()):
        bar_y = y + i * 55
        # 라벨
        draw.text((60, bar_y + 5), genre, fill=hex_to_rgb(GRAY_700), font=f_genre)

        # 바
        bar_x = 200
        bar_max_w = WIDTH - 200 - 150
        bar_w = max(int(bar_max_w * count / max_val), 30)
        color = bar_colors[i % len(bar_colors)]
        draw.rounded_rectangle(
            [(bar_x, bar_y + 5), (bar_x + bar_w, bar_y + 35)],
            radius=10, fill=hex_to_rgb(color),
        )

        # 숫자
        draw.text((bar_x + bar_w + 15, bar_y + 5), f"{count}건", fill=hex_to_rgb(GRAY_700), font=f_genre_num)

    # ── CTA ──
    cta_y = HEIGHT - 210
    draw.rounded_rectangle(
        [(60, cta_y), (WIDTH - 60, cta_y + 70)],
        radius=35, fill=hex_to_rgb(PRIMARY),
    )
    f_cta = get_font(28, bold=True)
    cta_text = "오디션 확인하러 가기"
    cta_bbox = draw.textbbox((0, 0), cta_text, font=f_cta)
    cw = cta_bbox[2] - cta_bbox[0]
    draw.text(((WIDTH - cw) // 2, cta_y + 18), cta_text, fill=hex_to_rgb(WHITE), font=f_cta)

    # ── 푸터 ──
    draw_brand_footer(draw, HEIGHT - 120)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"weekly_{date.today().isoformat()}.png"
    path = OUTPUT_DIR / filename
    img.save(str(path), "PNG", quality=95)
    logger.info(f"주간통계 카드 생성: {path}")
    return path


def generate_weekly_caption(stats: dict | None = None) -> str:
    if stats is None:
        stats = fetch_weekly_stats()

    lines = [
        f"📊 이번 주 오디션 리포트 ({stats['week_start']}~{stats['week_end']})",
        "",
        f"📌 지원 가능한 오디션: {stats['total']}건",
        f"✅ 원클릭 지원: {stats['email_count']}건",
        f"🔗 사이트 지원: {stats['external_count']}건",
        "",
        "📂 장르별 현황",
    ]
    for genre, count in stats["genres"].items():
        lines.append(f"  ▪️ {genre}: {count}건")

    lines.append("")
    lines.append("👉 프로필 링크에서 바로 확인!")
    lines.append("")
    lines.append("#오디션 #오디션정보 #배우오디션 #모델오디션")
    lines.append("#주간리포트 #캐스팅 #오디션패스 #배우지망생")

    return "\n".join(lines)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    stats = fetch_weekly_stats()
    path = generate_weekly_card(stats)
    caption = generate_weekly_caption(stats)
    print(f"\n카드 생성: {path}")
    print(f"\n=== 캡션 ===\n{caption}")
