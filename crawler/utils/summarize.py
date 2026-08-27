"""
규칙 기반 description 요약 — 비용 0.

2026-08-22 "Anthropic API 사용 금지" 지시로 정제를 전면 대체했으나,
2026-08-27 DeepSeek V4-Flash 전환(월 ~1,500원)으로 정제가 복귀하여 지금은 **폴백** 역할이다:
  - REFINE_ENABLED=0/미설정 → 여기가 기본 경로
  - REFINE_ENABLED=1 이지만 API 실패/키 없음 → refine_description이 여기로 폴백
지우지 말 것. API가 죽어도 파이프라인이 멈추지 않게 하는 안전망이다.

목표는 refine_description과 동일: 300~600자 안에 배역/자격/일정/장소/페이/지원방법이 보이게.
방법: 라벨 줄 우선 추출 → 없으면 본문 앞부분. 인사말·해시태그·광고 문구 제거.
"""
from __future__ import annotations

import re

_LABELS = [
    ("배역", r"(?:모집\s*배역|배역|역할|캐릭터|출연\s*역)"),
    ("자격", r"(?:자격|조건|나이|연령|성별|대상|키|경력)"),
    ("일정", r"(?:촬영\s*일정|촬영\s*기간|촬영일|공연\s*기간|일정|오디션\s*일시|오디션\s*날짜)"),
    ("마감", r"(?:마감|접수\s*기간|모집\s*기간|지원\s*기간|접수\s*마감)"),
    ("장소", r"(?:장소|지역|위치|촬영\s*장소|오디션\s*장소)"),
    ("페이", r"(?:페이|출연료|보수|급여|회차당|일당|개런티)"),
    ("지원", r"(?:지원\s*방법|지원\s*방식|접수\s*방법|제출\s*서류|문의|이메일|연락처)"),
]
_LABEL_LINE = {k: re.compile(rf"^\W*{p}\s*[:：\-–|]\s*(.+)$", re.I) for k, p in _LABELS}
_LABEL_INLINE = {k: re.compile(rf"{p}\s*[:：]\s*([^\n]{{2,80}})", re.I) for k, p in _LABELS}

_NOISE_LINE = re.compile(
    r"^(안녕하세요|안녕하십니까|반갑습니다|감사합니다|많은\s*관심|많은\s*지원|좋은\s*하루|#|http|www\.|━|─|=|\*|-{3,})",
    re.I,
)
_HASHTAG = re.compile(r"#\S+")
_EMOJI = re.compile(r"[\U0001F000-\U0001FAFF☀-➿️]")
_WS = re.compile(r"[ \t]+")


def _clean_line(line: str) -> str:
    line = _HASHTAG.sub("", line)
    line = _EMOJI.sub("", line)
    line = _WS.sub(" ", line).strip(" ·•▪■※-|")
    return line


def summarize(text: str, max_chars: int = 600) -> str:
    """본문 → 라벨 bullet 요약. 라벨을 못 찾으면 앞부분 정리본."""
    if not text:
        return ""
    text = text.replace("\r", "")
    lines = [_clean_line(l) for l in text.split("\n")]
    lines = [l for l in lines if len(l) >= 2 and not _NOISE_LINE.match(l)]

    found: dict[str, str] = {}
    # 1) 줄 단위 라벨
    for l in lines:
        for k, rx in _LABEL_LINE.items():
            if k in found:
                continue
            m = rx.match(l)
            if m and len(m.group(1).strip()) >= 2:
                found[k] = m.group(1).strip()[:120]
                break
    # 2) 인라인 라벨 (한 줄에 여러 항목)
    joined = " ".join(lines)
    for k, rx in _LABEL_INLINE.items():
        if k in found:
            continue
        m = rx.search(joined)
        if m:
            found[k] = m.group(1).strip()[:120]

    if len(found) >= 2:
        out = "\n".join(f"• {k}: {v}" for k, v in found.items())
        # 라벨이 못 담은 맥락 한 줄(첫 유의미 줄)
        lead = next((l for l in lines if len(l) >= 10 and not any(v in l for v in found.values())), "")
        if lead:
            out = lead[:100] + "\n" + out
        return out[:max_chars]

    # 3) 폴백: 정리된 앞부분
    body = " ".join(lines)
    body = re.sub(r"\s{2,}", " ", body).strip()
    if len(body) > max_chars:
        cut = body[:max_chars]
        cut = cut[: max(cut.rfind(". "), cut.rfind("다 "), cut.rfind(" ")) + 1] or cut
        body = cut.rstrip() + "…"
    return body
