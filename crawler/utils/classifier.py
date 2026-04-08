"""
오디션 카테고리 자동 분류기 — 3단계 파이프라인
Stage 1: 키워드 매칭 (비용 0)
Stage 2: 규칙 기반 보정 (비용 0)
Stage 3: AI 분류 (최소 비용, 확신도 낮은 경우만)
"""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# ============================================
# 카테고리 정의
# ============================================

CATEGORIES = {
    "idol": "아이돌",
    "actor": "배우",
    "model": "모델",
    "kids_model": "키즈모델",
    "singer": "가수",
    "trot": "트로트",
    "photo_model": "촬영모델",
    "musical": "뮤지컬",
    "theater": "연극",
    "voice_actor": "성우",
    "dancer": "댄서",
    "mc": "MC/진행자",
    "extra": "엑스트라",
    "influencer": "인플루언서",
}

# DB에 저장할 한글 카테고리명 (기존 호환)
CATEGORY_DISPLAY = {v: k for k, v in CATEGORIES.items()}

# ============================================
# Stage 1: 키워드 매칭
# ============================================

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "idol": [
        "아이돌", "연습생", "기획사 오디션", "데뷔", "보이그룹", "걸그룹",
        "K-POP", "케이팝", "트레이닝", "프로듀스", "서바이벌",
    ],
    "kids_model": [
        "키즈", "아동모델", "어린이", "유아", "주니어모델", "키즈모델",
        "아기모델", "초등", "영유아",
    ],
    "trot": [
        "트로트", "미스트롯", "미스터트롯", "국민가수", "트롯",
    ],
    "musical": [
        "뮤지컬", "넘버", "앙상블", "스윙", "뮤지컬배우", "창작뮤지컬",
    ],
    "theater": [
        "연극", "소극장", "대학로", "공연배우", "무대",
    ],
    "voice_actor": [
        "성우", "더빙", "나레이션", "보이스오버", "보이스액팅",
    ],
    "dancer": [
        "댄서", "안무", "백업댄서", "뮤비댄서", "공연댄서", "댄스팀",
    ],
    "mc": [
        "MC", "진행자", "리포터", "아나운서", "VJ", "쇼호스트",
    ],
    "extra": [
        "엑스트라", "보조출연", "단역", "행인역", "보조연", "단역배우",
    ],
    "influencer": [
        "인플루언서", "크리에이터", "유튜버", "틱톡커", "인스타그래머",
    ],
    "photo_model": [
        "촬영모델", "쇼핑몰모델", "광고모델", "피팅모델", "제품촬영",
        "쇼핑몰", "의류촬영", "화장품모델",
    ],
    "singer": [
        "가수", "싱어", "보컬", "노래", "음원", "싱어송라이터", "오디션프로그램",
    ],
    "model": [
        "모델", "패션모델", "화보", "런웨이", "패션위크", "모델에이전시",
    ],
    "actor": [
        "배우", "연기", "드라마", "영화", "캐스팅", "웹드라마", "시리즈",
        "단편영화", "독립영화", "장편", "OTT", "넷플릭스", "티빙",
    ],
}

# 키워드별 가중치 (특정 키워드는 더 강한 신호)
HIGH_WEIGHT_KEYWORDS: dict[str, list[str]] = {
    "idol": ["연습생", "보이그룹", "걸그룹"],
    "kids_model": ["키즈모델", "아동모델", "영유아"],
    "trot": ["트로트", "미스트롯"],
    "extra": ["보조출연", "엑스트라"],
}


@dataclass
class ClassifyResult:
    category: str          # 한글 카테고리 (DB 저장용)
    category_code: str     # 영문 코드
    confidence: float      # 확신도 0.0 ~ 1.0
    method: str            # "keyword" | "rule" | "ai"
    sub_category: Optional[str] = None


def classify_by_keyword(title: str, description: str = "") -> ClassifyResult:
    """Stage 1: 키워드 점수 기반 분류"""
    text = f"{title} {description}".lower()
    scores: dict[str, float] = {}

    for cat_code, keywords in CATEGORY_KEYWORDS.items():
        score = 0.0
        for kw in keywords:
            if kw.lower() in text:
                # 고가중치 키워드
                if cat_code in HIGH_WEIGHT_KEYWORDS and kw in HIGH_WEIGHT_KEYWORDS[cat_code]:
                    score += 3.0
                # 제목에 있으면 가중치 2배
                elif kw.lower() in title.lower():
                    score += 2.0
                else:
                    score += 1.0
        if score > 0:
            scores[cat_code] = score

    if not scores:
        return ClassifyResult(
            category="기타",
            category_code="etc",
            confidence=0.0,
            method="keyword",
        )

    # 최고 점수 카테고리
    best = max(scores, key=scores.get)  # type: ignore
    best_score = scores[best]
    total_score = sum(scores.values())

    # 확신도: 최고 점수 / 전체 점수
    confidence = best_score / total_score if total_score > 0 else 0.0

    # 점수 절대값도 반영 (점수 자체가 높으면 확신도 보정)
    if best_score >= 5:
        confidence = max(confidence, 0.85)
    elif best_score >= 3:
        confidence = max(confidence, 0.7)

    return ClassifyResult(
        category=CATEGORIES.get(best, "기타"),
        category_code=best,
        confidence=round(confidence, 2),
        method="keyword",
    )


# ============================================
# Stage 2: 규칙 기반 보정
# ============================================

# 출처 사이트별 기본 카테고리 가중치
SOURCE_CATEGORY_BIAS: dict[str, str] = {
    "casting114": "actor",
    "castingnara": "actor",
    "castik": "actor",
    "castlink": "actor",
    "plfil": "actor",
    "vaudition": "actor",
    "otr": "actor",
    "megaphone": "model",
    "filmmakers": "actor",
}

# 나이 조건 → 카테고리 매핑
AGE_RULES = [
    (r"(?:0|1|2|3|4|5|6)\s*세|유아|영유아|아기", "kids_model"),
    (r"(?:7|8|9|10|11|12)\s*세|초등", "kids_model"),
    (r"(?:13|14|15)\s*세|중학|주니어", "kids_model"),
]


def classify_by_rule(
    result: ClassifyResult,
    source_name: str = "",
    title: str = "",
    description: str = "",
) -> ClassifyResult:
    """Stage 2: 규칙 기반 보정"""
    import re
    text = f"{title} {description}"

    # 나이 규칙 체크
    for pattern, cat_code in AGE_RULES:
        if re.search(pattern, text):
            return ClassifyResult(
                category=CATEGORIES[cat_code],
                category_code=cat_code,
                confidence=max(result.confidence, 0.8),
                method="rule",
            )

    # 확신도가 낮고 출처에 편향이 있으면 보정
    if result.confidence < 0.5 and source_name.lower().replace(" ", "") in SOURCE_CATEGORY_BIAS:
        bias_code = SOURCE_CATEGORY_BIAS[source_name.lower().replace(" ", "")]
        if result.category_code == "etc":
            return ClassifyResult(
                category=CATEGORIES[bias_code],
                category_code=bias_code,
                confidence=0.5,
                method="rule",
            )

    return result


# ============================================
# 통합 분류 함수
# ============================================

def classify_audition(
    title: str,
    description: str = "",
    source_name: str = "",
) -> ClassifyResult:
    """
    오디션 공고를 자동 분류한다.
    Stage 1 (키워드) → Stage 2 (규칙) 순서로 실행.
    확신도 0.6 이상이면 결과 반환, 미만이면 "기타"로 저장 후 AI 배치 대기.
    """
    # Stage 1
    result = classify_by_keyword(title, description)

    # Stage 2
    result = classify_by_rule(result, source_name, title, description)

    # 확신도 로깅
    if result.confidence < 0.6:
        logger.debug(
            f"[분류 불확실] '{title[:30]}...' → {result.category} "
            f"(확신도 {result.confidence}, {result.method})"
        )

    return result


# ============================================
# 기존 genre 필드와 호환 매핑
# ============================================

def to_legacy_genre(category_code: str) -> str:
    """새 카테고리 코드를 기존 DB genre 필드로 매핑 (하위 호환)"""
    LEGACY_MAP = {
        "actor": "배우",
        "musical": "배우",
        "theater": "배우",
        "voice_actor": "배우",
        "extra": "배우",
        "model": "모델",
        "photo_model": "모델",
        "kids_model": "모델",
        "idol": "기타",
        "singer": "기타",
        "trot": "기타",
        "dancer": "기타",
        "mc": "기타",
        "influencer": "기타",
    }
    return LEGACY_MAP.get(category_code, "기타")
