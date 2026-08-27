"""
DeepSeek API를 이용한 오디션 공고 description 정제

2026-08-27 Anthropic(Haiku 4.5) → DeepSeek V4-Flash 교체.
근거: 동일 작업 기준 월 8,300원 → 약 1,500원(1/5). 오프피크(한국 밤·새벽·주말) 추가 반값.
DeepSeek은 선불 충전식이라 잔액이 곧 지출 상한 — 별도 예산 가드가 필요 없다.

호출 경로: utils/supabase_client.py:_refine_if_needed() — REFINE_ENABLED=1 일 때만 여기로 온다.
실패 시 규칙 기반 summarize()로 폴백하므로 API가 죽어도 파이프라인은 멈추지 않는다.
"""

import os
import logging

from utils.summarize import summarize

logger = logging.getLogger(__name__)

_client = None

BASE_URL = "https://api.deepseek.com"
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")


def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not api_key:
            logger.warning("DEEPSEEK_API_KEY가 설정되지 않아 description 정제를 건너뜁니다.")
            return None
        from openai import OpenAI
        _client = OpenAI(api_key=api_key, base_url=BASE_URL, timeout=30.0, max_retries=2)
    return _client


SYSTEM_PROMPT = "오디션 공고 핵심만 300자 이내 bullet로 정리. 항목: 배역/자격/일정/장소/페이/지원방법. 없는 항목 생략. 인사말·광고 제거. 한국어."


def refine_description(raw_text: str, title: str) -> str:
    """원본 description을 DeepSeek API로 정제하여 반환. 실패 시 규칙 기반 요약으로 폴백."""
    if not raw_text or len(raw_text.strip()) < 10:
        return raw_text or ""

    client = _get_client()
    if client is None:
        return summarize(raw_text)

    # 토큰 절약: 입력을 1000자로 제한 (실측 99%가 1000자 이내)
    truncated = raw_text[:1000]

    try:
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=250,
            temperature=1.0,  # DeepSeek 권장: 데이터 정제/분석 = 1.0
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"공고 제목: {title}\n\n원본 텍스트:\n{truncated}"},
            ],
        )
        refined = (response.choices[0].message.content or "").strip()
        if not refined:
            logger.warning("  DeepSeek 응답이 비어 규칙 기반 요약으로 폴백")
            return summarize(raw_text)
        # 300자 초과 시 잘라냄
        if len(refined) > 300:
            refined = refined[:297] + "..."
        return refined
    except Exception as e:
        logger.warning(f"  DeepSeek API 정제 실패, 규칙 기반 요약으로 폴백: {e}")
        return summarize(raw_text)
