"""
Claude API를 이용한 오디션 공고 description 정제
"""

import os
import logging

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            logger.warning("ANTHROPIC_API_KEY가 설정되지 않아 description 정제를 건너뜁니다.")
            return None
        import anthropic
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


SYSTEM_PROMPT = "오디션 공고 핵심만 300자 이내 bullet로 정리. 항목: 배역/자격/일정/장소/페이/지원방법. 없는 항목 생략. 인사말·광고 제거. 한국어."


def refine_description(raw_text: str, title: str) -> str:
    """원본 description을 Claude API로 정제하여 반환"""
    if not raw_text or len(raw_text.strip()) < 10:
        return raw_text or ""

    client = _get_client()
    if client is None:
        return raw_text

    # 토큰 절약: 입력을 1000자로 제한 (실측 99%가 1000자 이내)
    truncated = raw_text[:1000]

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=250,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"공고 제목: {title}\n\n원본 텍스트:\n{truncated}",
                }
            ],
        )
        refined = message.content[0].text.strip()
        # 300자 초과 시 잘라냄
        if len(refined) > 300:
            refined = refined[:297] + "..."
        return refined
    except Exception as e:
        logger.warning(f"  Claude API 정제 실패, 원본 사용: {e}")
        return raw_text[:300]
