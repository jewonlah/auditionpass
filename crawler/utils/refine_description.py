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


SYSTEM_PROMPT = """당신은 오디션 공고 정보를 정리하는 어시스턴트입니다.
주어진 원본 텍스트에서 오디션 관련 핵심 정보만 추출하여 bullet point로 정리하세요.

규칙:
- 300자 이내로 작성
- 아래 항목 중 존재하는 것만 포함:
  • 모집분야/배역
  • 지원자격 (나이, 성별, 경력 등)
  • 일정 (오디션일, 촬영일, 공연일 등)
  • 장소
  • 페이/출연료
  • 지원방법
- 불필요한 인사말, 사이트 안내, 광고 문구 제거
- 정보가 없으면 "상세 정보 없음"으로 반환
- 한국어로 작성"""


def refine_description(raw_text: str, title: str) -> str:
    """원본 description을 Claude API로 정제하여 반환"""
    if not raw_text or len(raw_text.strip()) < 10:
        return raw_text or ""

    client = _get_client()
    if client is None:
        return raw_text

    # 토큰 절약: 입력을 2000자로 제한
    truncated = raw_text[:2000]

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
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
