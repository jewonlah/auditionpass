"""
오늘의 오디션 TOP 5 — 인스타 카드 생성기
"""

import os
import logging
from datetime import date
from pathlib import Path
from PIL import Image, ImageDraw
from dotenv import load_dotenv
from supabase import create_client
from brand import (
    PRIMARY, PRIMARY_DARK, PRIMARY_LIGHT, WHITE, GRAY_50, GRAY_100,
    GRAY_500, GRAY_700, GRAY_900, SUCCESS, WARNING, DANGER, ACCENT,
    WIDTH, HEIGHT, OUTPUT_DIR,
    hex_to_rgb, get_font, truncate, dday_text, clean_text,
    draw_pill_badge, draw_brand_footer,
)

load_dotenv(Path(__file__).parent.parent / ".env")
logger = logging.getLogger(__name__)


def fetch_top5() -> list[dict]:
    """Supabase에서 오늘의 TOP 5 오디션 조회"""
    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    today = date.today().isoformat()
    data = (
        sb.table("auditions")
        .select("title,company,genre,deadline,apply_type,source_name")
        .eq("is_active", True)
        .or_(f"deadline.gte.{today},deadline.is.null")
        .order("apply_type", desc=False)
        .order("deadline", desc=False, nullsfirst=False)
        .limit(5)
        .execute()
    )
    return data.data or []


def generate_top5_card(auditions: list[dict] | None = None) -> Path:
    if auditions is None:
        auditions = fetch_top5()

    today_str = date.today().strftime("%Y.%m.%d")
    today_weekday = ["월", "화", "수", "목", "금", "토", "일"][date.today().weekday()]

    img = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(WHITE))
    draw = ImageDraw.Draw(img)

    # 폰트
    f_hook = get_font(46, bold=True)
    f_title = get_font(56, bold=True)
    f_date = get_font(26)
    f_num = get_font(28, bold=True)
    f_item = get_font(32, bold=True)
    f_sub = get_font(24)
    f_badge = get_font(22, bold=True)
    f_dday = get_font(26, bold=True)

    # ── 상단 헤더 (그라데이션 느낌: 진한 → 연한) ──
    draw.rectangle([(0, 0), (WIDTH, 280)], fill=hex_to_rgb(PRIMARY_DARK))
    # 장식 원 (우상단)
    draw.ellipse([(WIDTH - 200, -80), (WIDTH + 80, 200)], fill=hex_to_rgb(PRIMARY))
    draw.ellipse([(WIDTH - 120, -40), (WIDTH + 40, 120)], fill=hex_to_rgb(PRIMARY_LIGHT))

    # 후킹 텍스트
    draw.text((60, 40), "오늘 놓치면 안 되는", fill=(*hex_to_rgb(WHITE), 200), font=f_hook)
    # 메인 타이틀
    draw.text((60, 100), "오디션 TOP 5", fill=hex_to_rgb(WHITE), font=f_title)
    # 날짜
    draw.text((60, 180), f"{today_str} ({today_weekday})", fill=hex_to_rgb(PRIMARY_LIGHT), font=f_date)
    # 총 공고 수 배지
    draw_pill_badge(draw, (60, 225), f"오늘의 신규 공고 {len(auditions)}건+", f_badge, ACCENT, WHITE)

    # ── 카드 리스트 ──
    y = 310
    card_h = 170
    card_gap = 14

    for i, aud in enumerate(auditions[:5]):
        card_y = y

        # 카드 배경 + 좌측 컬러 바
        draw.rounded_rectangle(
            [(40, card_y), (WIDTH - 40, card_y + card_h)],
            radius=16, fill=hex_to_rgb(GRAY_50),
        )
        # 좌측 액센트 바
        bar_color = PRIMARY if aud.get("apply_type") == "email" else GRAY_300
        draw.rounded_rectangle(
            [(40, card_y), (48, card_y + card_h)],
            radius=0, fill=hex_to_rgb(bar_color),
        )

        # 번호
        num_x, num_y = 70, card_y + 25
        draw.text((num_x, num_y), f"0{i+1}", fill=hex_to_rgb(PRIMARY), font=f_num)

        # 제목 (2줄까지)
        title = truncate(aud.get("title", ""), 18)
        draw.text((130, card_y + 22), title, fill=hex_to_rgb(GRAY_900), font=f_item)

        # 하단: 회사 | D-day | 지원타입
        sub_y = card_y + 80
        sub_x = 130

        # 장르 배지
        genre = aud.get("genre", "")
        if genre:
            sub_x = draw_pill_badge(draw, (sub_x, sub_y), genre, f_badge, GRAY_100, GRAY_700) + 10

        # 회사명
        if aud.get("company"):
            company = truncate(aud["company"], 8)
            draw.text((sub_x, sub_y + 4), company, fill=hex_to_rgb(GRAY_500), font=f_sub)
            bbox = draw.textbbox((sub_x, sub_y + 4), company, font=f_sub)
            sub_x = bbox[2] + 16

        # D-day
        dd, dd_color = dday_text(aud.get("deadline"))
        draw.text((sub_x, sub_y + 4), dd, fill=hex_to_rgb(dd_color), font=f_dday)
        bbox = draw.textbbox((sub_x, sub_y + 4), dd, font=f_dday)
        sub_x = bbox[2] + 16

        # 지원타입 배지 (우측 정렬)
        if aud.get("apply_type") == "email":
            badge_t, badge_c = "원클릭지원", SUCCESS
        else:
            badge_t, badge_c = "사이트지원", GRAY_500
        badge_bbox = draw.textbbox((0, 0), badge_t, font=f_badge)
        bw = badge_bbox[2] - badge_bbox[0] + 32
        draw_pill_badge(draw, (WIDTH - 40 - bw - 20, sub_y), badge_t, f_badge, badge_c, WHITE)

        y += card_h + card_gap

    # ── CTA 영역 ──
    cta_y = HEIGHT - 210
    draw.rounded_rectangle(
        [(60, cta_y), (WIDTH - 60, cta_y + 70)],
        radius=35, fill=hex_to_rgb(PRIMARY),
    )
    cta_text = "지금 바로 확인하기"
    f_cta = get_font(28, bold=True)
    cta_bbox = draw.textbbox((0, 0), cta_text, font=f_cta)
    cw = cta_bbox[2] - cta_bbox[0]
    draw.text(((WIDTH - cw) // 2, cta_y + 18), cta_text, fill=hex_to_rgb(WHITE), font=f_cta)

    # ── 브랜드 푸터 ──
    draw_brand_footer(draw, HEIGHT - 120)

    # 저장
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"top5_{date.today().isoformat()}.png"
    path = OUTPUT_DIR / filename
    img.save(str(path), "PNG", quality=95)
    logger.info(f"TOP5 카드 생성: {path}")
    return path


def generate_top5_caption(auditions: list[dict] | None = None) -> str:
    if auditions is None:
        auditions = fetch_top5()

    today_str = date.today().strftime("%m월 %d일")
    lines = [
        f"오늘 놓치면 안 되는 오디션 TOP 5 ({today_str})",
        "",
    ]

    for i, aud in enumerate(auditions[:5]):
        title = truncate(aud.get("title", ""), 28)
        dd, _ = dday_text(aud.get("deadline"))
        apply_t = "원클릭지원" if aud.get("apply_type") == "email" else "사이트지원"
        emoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][i]
        lines.append(f"{emoji} {title}")
        lines.append(f"    {dd} | {apply_t}")
        lines.append("")

    lines.append("👉 프로필 링크에서 바로 지원하세요!")
    lines.append("")
    lines.append("━━━━━━━━━━━━━━━")
    lines.append("📌 매일 업데이트되는 오디션 정보")
    lines.append("📌 버튼 하나로 원클릭 지원")
    lines.append("━━━━━━━━━━━━━━━")
    lines.append("")
    lines.append("#오디션 #캐스팅 #배우오디션 #모델오디션 #오디션정보")
    lines.append("#뮤지컬오디션 #연극오디션 #배우지망생 #모델지망생")
    lines.append("#오디션패스 #auditionpass #캐스팅정보 #연기")
    lines.append("#무명배우 #배우준비생 #연기지망생 #배우꿈")

    return "\n".join(lines)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    auditions = fetch_top5()
    path = generate_top5_card(auditions)
    caption = generate_top5_caption(auditions)
    print(f"\n카드 생성: {path}")
    print(f"\n=== 캡션 ===\n{caption}")
