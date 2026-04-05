"""
마감 임박 오디션 — 인스타 카드 생성기
D-3 이내 마감 오디션을 긴급 카드로 생성
"""

import os
import logging
from datetime import date, timedelta
from pathlib import Path
from PIL import Image, ImageDraw
from dotenv import load_dotenv
from supabase import create_client
from brand import (
    PRIMARY, WHITE, GRAY_50, GRAY_100, GRAY_300, GRAY_500, GRAY_700,
    GRAY_900, SUCCESS, WARNING, DANGER, DANGER_LIGHT, ACCENT,
    WIDTH, HEIGHT, OUTPUT_DIR,
    hex_to_rgb, get_font, truncate, clean_text,
    draw_pill_badge, draw_brand_footer,
)

load_dotenv(Path(__file__).parent.parent / ".env")
logger = logging.getLogger(__name__)


def fetch_deadline_soon() -> list[dict]:
    """D-3 이내 마감 오디션 조회"""
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    today = date.today().isoformat()
    d3 = (date.today() + timedelta(days=3)).isoformat()
    data = (
        sb.table("auditions")
        .select("title,company,genre,deadline,apply_type")
        .eq("is_active", True)
        .gte("deadline", today)
        .lte("deadline", d3)
        .order("deadline", desc=False)
        .limit(5)
        .execute()
    )
    return data.data or []


def generate_deadline_card(auditions: list[dict] | None = None) -> Path | None:
    if auditions is None:
        auditions = fetch_deadline_soon()
    if not auditions:
        logger.info("마감 임박 오디션 없음 — 카드 생략")
        return None

    today_str = date.today().strftime("%Y.%m.%d")
    count = len(auditions)

    img = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(WHITE))
    draw = ImageDraw.Draw(img)

    f_hook = get_font(44, bold=True)
    f_title = get_font(56, bold=True)
    f_count = get_font(26)
    f_dday = get_font(36, bold=True)
    f_item = get_font(30, bold=True)
    f_sub = get_font(24)
    f_badge = get_font(22, bold=True)
    f_cta = get_font(28, bold=True)

    # ── 상단 헤더 (빨간 배경 + 경고 느낌) ──
    draw.rectangle([(0, 0), (WIDTH, 280)], fill=hex_to_rgb(DANGER))
    # 장식
    draw.ellipse([(WIDTH - 180, -60), (WIDTH + 60, 180)], fill=(*hex_to_rgb(DANGER), 200))

    # 후킹
    draw.text((60, 35), "서두르세요!", fill=(*hex_to_rgb(WHITE), 200), font=f_hook)
    draw.text((60, 95), "마감 임박 오디션", fill=hex_to_rgb(WHITE), font=f_title)
    draw.text((60, 180), f"{today_str}  |  {count}건 마감 예정", fill=(*hex_to_rgb(WHITE), 220), font=f_count)

    # 긴급 배지
    draw_pill_badge(draw, (60, 225), "놓치면 후회합니다", f_badge, WHITE, DANGER)

    # ── 카드 리스트 ──
    y = 310
    card_h = 160
    card_gap = 14
    max_items = min(len(auditions), 5)

    for aud in auditions[:max_items]:
        card_y = y

        # 카드 배경 (연한 빨강)
        draw.rounded_rectangle(
            [(40, card_y), (WIDTH - 40, card_y + card_h)],
            radius=16, fill=hex_to_rgb(DANGER_LIGHT),
        )
        # 좌측 빨간 바
        draw.rounded_rectangle(
            [(40, card_y), (48, card_y + card_h)],
            radius=0, fill=hex_to_rgb(DANGER),
        )

        # D-day 배지
        deadline = aud.get("deadline", "")
        try:
            diff = (date.fromisoformat(deadline) - date.today()).days
            dd = "오늘!" if diff == 0 else f"D-{diff}"
        except (ValueError, TypeError):
            dd = "D-?"

        dd_x = 70
        draw.text((dd_x, card_y + 22), dd, fill=hex_to_rgb(DANGER), font=f_dday)

        # 제목
        title = truncate(aud.get("title", ""), 17)
        draw.text((200, card_y + 22), title, fill=hex_to_rgb(GRAY_900), font=f_item)

        # 부가 정보
        sub_y = card_y + 80
        sub_x = 200
        parts = []
        if aud.get("company"):
            parts.append(truncate(aud["company"], 8))
        parts.append(aud.get("genre", ""))
        sub_text = "  ·  ".join(p for p in parts if p)
        draw.text((sub_x, sub_y), sub_text, fill=hex_to_rgb(GRAY_500), font=f_sub)

        # 지원타입 배지 (우측)
        if aud.get("apply_type") == "email":
            badge_t, badge_c = "원클릭지원", SUCCESS
        else:
            badge_t, badge_c = "사이트지원", GRAY_500
        badge_bbox = draw.textbbox((0, 0), badge_t, font=f_badge)
        bw = badge_bbox[2] - badge_bbox[0] + 32
        draw_pill_badge(draw, (WIDTH - 40 - bw - 20, sub_y - 4), badge_t, f_badge, badge_c, WHITE)

        y += card_h + card_gap

    # ── CTA 버튼 ──
    cta_y = HEIGHT - 210
    draw.rounded_rectangle(
        [(60, cta_y), (WIDTH - 60, cta_y + 70)],
        radius=35, fill=hex_to_rgb(DANGER),
    )
    cta_text = "지금 바로 지원하기"
    cta_bbox = draw.textbbox((0, 0), cta_text, font=f_cta)
    cw = cta_bbox[2] - cta_bbox[0]
    draw.text(((WIDTH - cw) // 2, cta_y + 18), cta_text, fill=hex_to_rgb(WHITE), font=f_cta)

    # ── 브랜드 푸터 ──
    draw_brand_footer(draw, HEIGHT - 120)

    # 저장
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"deadline_{date.today().isoformat()}.png"
    path = OUTPUT_DIR / filename
    img.save(str(path), "PNG", quality=95)
    logger.info(f"마감임박 카드 생성: {path}")
    return path


def generate_deadline_caption(auditions: list[dict] | None = None) -> str:
    if auditions is None:
        auditions = fetch_deadline_soon()
    if not auditions:
        return ""

    lines = [
        "🚨 마감 임박! 서두르세요!",
        "",
    ]
    for aud in auditions[:5]:
        title = truncate(aud.get("title", ""), 28)
        deadline = aud.get("deadline", "")
        try:
            diff = (date.fromisoformat(deadline) - date.today()).days
            dd = "⏰ 오늘 마감" if diff == 0 else f"⏰ D-{diff}"
        except (ValueError, TypeError):
            dd = ""
        apply_t = "✅ 원클릭지원" if aud.get("apply_type") == "email" else ""
        lines.append(f"▪️ {title}")
        parts = [p for p in [dd, apply_t] if p]
        if parts:
            lines.append(f"    {' | '.join(parts)}")
        lines.append("")

    lines.append("👉 프로필 링크에서 바로 지원!")
    lines.append("")
    lines.append("#마감임박 #오디션마감 #배우오디션 #모델오디션")
    lines.append("#오디션정보 #캐스팅 #배우지망생 #오디션패스")
    lines.append("#연기 #무명배우 #배우준비생 #연기지망생")

    return "\n".join(lines)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    auditions = fetch_deadline_soon()
    if auditions:
        path = generate_deadline_card(auditions)
        caption = generate_deadline_caption(auditions)
        print(f"\n카드 생성: {path}")
        print(f"\n=== 캡션 ===\n{caption}")
    else:
        print("마감 임박 오디션 없음")
