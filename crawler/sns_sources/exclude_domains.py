"""
저장 금지 도메인 (플랜 E-7 · 사용자 결정 2026-08-22 "링크 역추적 모드").

- AGGREGATORS: 남의 공고를 모아 보여주는 경쟁 서비스. 잡코리아 v 사람인(DB제작자 권리, 합의 120억) 리스크 →
  **텍스트를 저장하지 않는다.** 발견(역추적)에만 쓴다: sns_sources/backtrace.py
- PORTALS: 포털·SNS·쇼핑·구인 플랫폼 — 웹문서 검색 결과에서 제외(별도 채널로 수집하거나 수집 대상 아님)
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

AGGREGATORS = [
    "castingchatgo.com", "audee.co.kr", "plfil.com", "castlink.co.kr", "filmmakers.co.kr", "casting114.com",
    "castik.co.kr", "starlet-studio.co.kr", "otr.co.kr", "megaphonekorea.com", "castingnara.com", "vaudition.com",
    "ent.reviewpeople.kr",  # 오디션 정보 총정리(2차)
]
PORTALS = [
    "naver.com", "daum.net", "kakao.com", "tistory.com", "google.com", "youtube.com", "instagram.com", "facebook.com",
    "twitter.com", "x.com", "threads.net", "tiktok.com", "namu.wiki", "wikipedia.org", "coupang.com",
    "saramin.co.kr", "jobkorea.co.kr", "albamon.com", "alba.co.kr", "incruit.com", "wanted.co.kr", "indeed.com", "linkareer.com",
    "bizinfo.go.kr", "cboard.net",
]

_ALL = re.compile(r"(?:^|\.)(?:" + "|".join(re.escape(d) for d in AGGREGATORS + PORTALS) + r")$")
_AGG = re.compile(r"(?:^|\.)(?:" + "|".join(re.escape(d) for d in AGGREGATORS) + r")$")


def domain_of(url: str) -> str:
    try:
        h = (urlparse(url).hostname or "").lower()
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return ""


def is_excluded(url_or_domain: str) -> bool:
    d = domain_of(url_or_domain) if "://" in url_or_domain else url_or_domain.lower()
    return bool(_ALL.search(d))


def is_aggregator(url_or_domain: str) -> bool:
    d = domain_of(url_or_domain) if "://" in url_or_domain else url_or_domain.lower()
    return bool(_AGG.search(d))
