"""
공고 품질 점수 (0~1) — "쓸 정보 / 버릴 정보" 분리 기준 (2026-08-22).

가중치(합 1.0):
  0.35 apply_email 있음(원클릭 가능 — 핵심 가치)
  0.20 deadline 있음(만료 정확, D-day 표시 가능)
  0.15 본문 충실도(요약이라도 200자 이상이면 만점, 50자 미만 0)
  0.15 출처 신뢰(1차 출처·검증된 사이트 > 커뮤니티 요약)
  0.10 제목 품질(작품명/배역/조건 중 2개 이상 노출)
  0.05 분류 확신도(category_confidence)
프론트는 quality_score desc 정렬·임계치로 노출 제어. 크롤러는 저장만 하고 삭제하지 않는다(학습 데이터).
"""
from __future__ import annotations

import re

# 출처 신뢰도 — source_name 접두 매칭. 1차 출처/실명 사이트 1.0, 애그리게이터·커뮤니티 요약 0.5~0.7
SOURCE_TRUST: dict[str, float] = {
    "캐스틱": 1.0, "플필": 1.0, "캐스팅114": 0.9, "필메코": 0.9, "OTR": 0.9, "스타렛스튜디오": 0.8,
    "메가폰코리아": 0.8, "V오디션": 0.7, "캐스트링크": 0.7, "캐스팅나라": 0.7,
    "플레이DB": 0.9, "콘테스트코리아": 0.8, "고용24": 1.0, "기획사": 1.0,
    "네이버카페": 0.6, "네이버블로그": 0.5, "네이버웹문서": 0.6, "카카오카페": 0.6, "인스타그램": 0.5, "유튜브": 0.5,
}
_TITLE_SIGNALS = [
    re.compile(r"[<《〈\[「'\"“][^>》〉\]」'\"”]{2,40}[>》〉\]」'\"”]"),  # 작품명
    re.compile(r"주연|조연|단역|아역|배역|역\b|역할"),                  # 배역
    re.compile(r"\d{1,2}\s*[~\-]\s*\d{1,2}\s*(?:세|대)|\d{2}\s*대|남|여|외국인|시니어"),  # 조건
    re.compile(r"마감|급구|D-\d|까지"),                                  # 긴급도
]


def source_trust(source_name: str | None) -> float:
    if not source_name:
        return 0.5
    head = source_name.split(":")[0].replace("�", "").strip()
    for key, v in SOURCE_TRUST.items():
        if head.startswith(key) or key.startswith(head[:3]) and len(head) >= 3 and head[:3] == key[:3]:
            return v
    return 0.6


def quality_score(
    *, apply_email: str | None, deadline, description: str | None, source_name: str | None,
    title: str | None, category_confidence: float | None = None,
) -> float:
    s = 0.0
    if apply_email:
        s += 0.35
    if deadline:
        s += 0.20
    n = len((description or "").strip())
    s += 0.15 * min(1.0, max(0.0, (n - 50) / 150))
    s += 0.15 * source_trust(source_name)
    hits = sum(1 for rx in _TITLE_SIGNALS if rx.search(title or ""))
    s += 0.10 * min(1.0, hits / 2)
    s += 0.05 * min(1.0, max(0.0, category_confidence or 0.0))
    return round(min(1.0, s), 3)
