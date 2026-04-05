"""
오디션패스 브랜드 공통 모듈
컬러, 폰트, 유틸리티를 한곳에서 관리
"""

import os
import html
from datetime import date
from pathlib import Path
from PIL import ImageFont

# ── 브랜드 컬러 ──
PRIMARY = "#6366F1"
PRIMARY_DARK = "#4F46E5"
PRIMARY_LIGHT = "#A5B4FC"
WHITE = "#FFFFFF"
BLACK = "#000000"
GRAY_50 = "#F9FAFB"
GRAY_100 = "#F3F4F6"
GRAY_300 = "#D1D5DB"
GRAY_500 = "#6B7280"
GRAY_700 = "#374151"
GRAY_800 = "#1F2937"
GRAY_900 = "#111827"
SUCCESS = "#10B981"
SUCCESS_LIGHT = "#D1FAE5"
WARNING = "#F59E0B"
WARNING_LIGHT = "#FEF3C7"
DANGER = "#EF4444"
DANGER_LIGHT = "#FEE2E2"
ACCENT = "#EC4899"  # 핑크 (강조용)

# ── 슬로건 ──
SLOGAN = "당신의 다음 무대, 오디션패스"
BRAND_NAME = "AUDITIONPASS"
BRAND_HANDLE = "@auditionpass.kr"

# ── 카드 크기 ──
WIDTH = 1080
HEIGHT = 1350  # 인스타 세로형 4:5

OUTPUT_DIR = Path(__file__).parent / "output"


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """한국어 지원 폰트 로드"""
    font_paths = [
        "C:/Windows/Fonts/malgunbd.ttf" if bold else "C:/Windows/Fonts/malgun.ttf",
        "C:/Windows/Fonts/NanumGothicBold.ttf" if bold else "C:/Windows/Fonts/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf" if bold else "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, size)
    return ImageFont.load_default()


def clean_text(text: str) -> str:
    """HTML 엔티티 디코딩 + 불필요한 공백 정리"""
    text = html.unescape(text)
    text = text.replace("\n", " ").replace("\r", "").strip()
    return text


def truncate(text: str, max_len: int) -> str:
    text = clean_text(text)
    return text[:max_len-1] + "…" if len(text) > max_len else text


def dday_text(deadline: str | None) -> tuple[str, str]:
    """마감일 → (D-day 텍스트, 색상) 반환"""
    if not deadline:
        return "상시모집", GRAY_500
    try:
        d = date.fromisoformat(deadline)
        diff = (d - date.today()).days
        if diff < 0:
            return "마감", GRAY_500
        if diff == 0:
            return "오늘 마감", DANGER
        if diff <= 3:
            return f"D-{diff}", DANGER
        if diff <= 7:
            return f"D-{diff}", WARNING
        return f"D-{diff}", GRAY_500
    except ValueError:
        return "상시모집", GRAY_500


def draw_rounded_rect(draw, xy, radius, fill, outline=None, width=0):
    """라운드 사각형 (호환성 래퍼)"""
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_pill_badge(draw, xy, text, font, bg_color, text_color=WHITE, padding_x=16, padding_y=6):
    """둥근 필 배지 그리기, 우측 x 좌표 반환"""
    x, y = xy
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.rounded_rectangle(
        [(x, y), (x + tw + padding_x * 2, y + th + padding_y * 2)],
        radius=(th + padding_y * 2) // 2,
        fill=hex_to_rgb(bg_color),
    )
    draw.text((x + padding_x, y + padding_y), text, fill=hex_to_rgb(text_color), font=font)
    return x + tw + padding_x * 2


def draw_brand_footer(draw, y_start, width=WIDTH):
    """하단 브랜드 푸터 공통"""
    font_brand = get_font(30, bold=True)
    font_slogan = get_font(22)
    font_handle = get_font(22)

    # 구분선
    draw.line([(50, y_start), (width - 50, y_start)], fill=hex_to_rgb(GRAY_300), width=2)

    # 브랜드명 + 슬로건
    draw.text((60, y_start + 20), BRAND_NAME, fill=hex_to_rgb(PRIMARY), font=font_brand)
    draw.text((60, y_start + 60), SLOGAN, fill=hex_to_rgb(GRAY_500), font=font_slogan)

    # 핸들 (우측)
    handle_bbox = draw.textbbox((0, 0), BRAND_HANDLE, font=font_handle)
    hw = handle_bbox[2] - handle_bbox[0]
    draw.text((width - 60 - hw, y_start + 25), BRAND_HANDLE, fill=hex_to_rgb(GRAY_500), font=font_handle)
