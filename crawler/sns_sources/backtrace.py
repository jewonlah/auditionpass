"""
애그리게이터 링크 역추적 (플랜 E-7, 사용자 결정: 저장 X · 발견 O)

경쟁 애그리게이터(캐스팅찾고·Audee 등) 목록에서 **제목만** 읽어 NAVER 카페·웹문서 검색으로 **원글(1차 출처)** 을 찾고,
원글이 애그리게이터·포털이 아니면 그 원글을 기존 파이프라인(CafeItem → is_candidate → AuditionData)으로 저장한다.
애그리게이터의 텍스트·링크는 DB에 남기지 않는다.

실행: python -m sns_sources.backtrace [--dry-run]
"""
from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import Optional

import requests

from scrapers.base import AuditionData, BaseScraper
from sns_sources.exclude_domains import domain_of, is_excluded
from sns_sources.instagram_caption import _extract_deadline
from sns_sources.naver_cafe import CafeItem, _clean, _clean_title, is_candidate, _short_cafe
from utils.email_extract import extract_apply_email

logger = logging.getLogger(__name__)

AGGREGATOR_PAGES = [
    ("캐스팅찾고", "https://www.castingchatgo.com/jobs"),
    ("Audee", "https://audee.co.kr/"),
]
_TITLE_LINE = re.compile(r"(?:모집|오디션|캐스팅|구합니다|구인|채용)")
_ENDPOINTS = {
    "cafe": "https://naverapihub.apigw.ntruss.com/search/v1/cafearticle",
    "webkr": "https://naverapihub.apigw.ntruss.com/search/v1/webkr",
}


@dataclass
class Lead:
    aggregator: str
    title: str


def _render_text(url: str) -> str:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page(locale="ko-KR")
        pg.goto(url, wait_until="networkidle", timeout=45000)
        pg.wait_for_timeout(1500)
        for _ in range(3):
            pg.mouse.wheel(0, 2000)
            pg.wait_for_timeout(600)
        txt = pg.inner_text("body")
        b.close()
    return txt


def extract_leads(aggregator: str, text: str) -> list[Lead]:
    """렌더된 본문 텍스트에서 공고 제목 후보 줄만 추출(저장 X)."""
    leads: list[Lead] = []
    for line in text.splitlines():
        l = line.strip()
        if 12 <= len(l) <= 90 and _TITLE_LINE.search(l) and not re.search(r"시작하기|로그인|서비스 소개|FAQ|개의 공고", l):
            leads.append(Lead(aggregator, l))
    # 중복 제거(순서 유지)
    seen: set[str] = set()
    out = []
    for ld in leads:
        if ld.title not in seen:
            seen.add(ld.title)
            out.append(ld)
    return out


def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[가-힣A-Za-z0-9]{2,}", s) if t not in ("모집", "합니다", "구합니다", "오디션", "공고")}


def find_original(lead: Lead, cid: str, csec: str) -> Optional[CafeItem]:
    """제목으로 카페·웹문서 검색 → 제외 도메인이 아닌, 제목 토큰 겹침 ≥0.5인 첫 결과."""
    q = re.sub(r"[\[\]()<>《》〈〉\"'“”]", " ", lead.title)
    q = " ".join(q.split()[:8])
    want = _tokens(lead.title)
    for kind in ("cafe", "webkr"):
        try:
            r = requests.get(_ENDPOINTS[kind], headers={"X-NCP-APIGW-API-KEY-ID": cid, "X-NCP-APIGW-API-KEY": csec},
                             params={"query": q, "display": 10, "sort": "sim"}, timeout=15)
            r.raise_for_status()
        except Exception as e:
            logger.warning(f"역추적 검색 실패 '{q[:30]}': {str(e)[:80]}")
            continue
        for it in r.json().get("items", []):
            link = it.get("link", "")
            if not link or (kind == "webkr" and is_excluded(link)):
                continue
            title = _clean_title(it.get("title", ""))
            got = _tokens(title)
            overlap = len(want & got) / max(1, len(want))
            # 실측: 0.5는 '남자 아이돌 멤버 모집' 같은 일반 토큰으로 2021년 글·뉴스가 매칭됨 → 0.65 + 공고어 + 국내 도메인
            d = domain_of(link)
            if overlap >= 0.65 and _TITLE_LINE.search(title) and (d.endswith(".kr") or d.endswith(".com") or d.endswith(".net")):
                return CafeItem(title=title, description=_clean(it.get("description", "")), link=link,
                                cafename=_clean(it.get("cafename", "")) or domain_of(link), cafeurl=it.get("cafeurl", ""),
                                keyword=f"역추적:{lead.aggregator}")
        time.sleep(0.2)
    return None


class BacktraceScraper(BaseScraper):
    source_name = "역추적"

    def __init__(self):
        self.cid = os.environ.get("NAVER_API_HUB_CLIENT_ID", "")
        self.csec = os.environ.get("NAVER_API_HUB_CLIENT_SECRET", "")
        self.details: dict = {}

    @staticmethod
    def enabled() -> bool:
        return os.environ.get("NAVER_CAFE_ENABLED") == "1" and bool(os.environ.get("NAVER_API_HUB_CLIENT_ID"))

    def scrape(self) -> list[AuditionData]:
        leads: list[Lead] = []
        for name, url in AGGREGATOR_PAGES:
            try:
                leads.extend(extract_leads(name, _render_text(url)))
            except Exception as e:
                logger.warning(f"[역추적] {name} 렌더 실패: {str(e)[:80]}")
        found = 0
        out: list[AuditionData] = []
        for ld in leads[:40]:
            it = find_original(ld, self.cid, self.csec)
            if not it:
                continue
            found += 1
            ok, _ = is_candidate(it)
            if not ok:
                continue
            text = f"{it.title}\n{it.description}"
            src = f"네이버카페:{_short_cafe(it.cafename)}" if "cafe.naver.com" in it.link else f"네이버웹문서:{domain_of(it.link)}"
            out.append(AuditionData(
                title=it.title, company=None, genre=BaseScraper.classify_genre(text),
                deadline=_extract_deadline(text, posted_at=date.today(), posted_at_exact=False),
                apply_email=extract_apply_email(it.description),
                description=(f"{it.description}\n\n---\n출처: 원글 {it.cafename} (요약만 수집 — 전문·지원 방법은 원문 링크 확인)")[:2000],
                requirements=None, source_url=it.link, source_name=src,
            ))
        self.details = {"leads": len(leads), "originals_found": found, "saved_candidates": len(out)}
        logger.info(f"[역추적] 제목 {len(leads)} → 원글 {found} → 저장 후보 {len(out)}")
        return out


if __name__ == "__main__":
    import sys
    from pathlib import Path
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    s = BacktraceScraper()
    auds = s.scrape()
    for a in auds[:20]:
        print(f"[{a.genre}] {a.title[:55]} | {a.source_name} | 마감 {a.deadline} | {'✉' if a.apply_email else ' '} {a.source_url[:70]}")
    if "--dry-run" not in sys.argv and auds:
        from utils.supabase_client import upsert_auditions
        print("저장", upsert_auditions(auds))
