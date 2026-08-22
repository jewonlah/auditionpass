"""
네이버 블로그·웹문서 소싱 — 트랙 A-1 확장 (플랜 E-3, 2026-08-22)

NAVER API HUB 같은 Application에 블로그·웹문서가 등록돼 있어 추가 키 없이 사용.
  - 블로그  GET /search/v1/blog   : 오디션 공고를 블로그로 알리는 극단·학원·제작사. 후기·홍보 노이즈 큼 → 카페와 같은 필터.
  - 웹문서  GET /search/v1/webkr  : 기획사·제작사·극단·문화재단 **홈페이지 공고 URL 발굴**이 주목적.
    공고는 저장하되, 도메인은 source_candidates(발견 큐)에 적립 → 운영자 승인 시 official_pages/generic_board 화이트리스트로 승격.
필터·파싱은 naver_cafe의 is_candidate/_extract_deadline을 그대로 재사용(CafeItem 호환).
"""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import date, datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import requests

from scrapers.base import AuditionData, BaseScraper
from sns_sources.naver_cafe import CafeItem, _clean, _clean_title, is_candidate, _EMAIL_RE
from sns_sources.instagram_caption import _extract_deadline

logger = logging.getLogger(__name__)

ENDPOINTS = {
    "blog": "https://naverapihub.apigw.ntruss.com/search/v1/blog",
    "webkr": "https://naverapihub.apigw.ntruss.com/search/v1/webkr",
}
DISPLAY = 100

# 34 §3 — 발굴 목적 키워드(웹문서)와 공고 키워드(블로그)
KEYWORDS_WEB = [
    "오디션 공고 지원 이메일", "배우 모집 프로필 접수", "기획사 오디션 상시 접수", "극단 단원 모집 2026",
    "뮤지컬 오디션 공고 앙상블", "단편영화 배우 모집 이메일", "웹드라마 배우 모집 접수", "광고 모델 모집 프로필",
    "아역배우 오디션 공고", "쇼호스트 모집 접수", "아나운서 채용 공고 방송", "성우 모집 오디션",
    "댄서 모집 오디션", "보컬 오디션 공고 접수", "연습생 모집 공고 기획사",
]
KEYWORDS_BLOG = [
    "오디션 공고", "배우 모집", "캐스팅 공고", "단편영화 배우 모집", "뮤지컬 오디션", "연극 배우 모집",
    "아역배우 모집", "모델 모집 촬영", "쇼호스트 모집", "성우 모집", "댄서 모집", "가수 오디션", "연습생 모집",
]

# 웹문서에서 제외할 도메인 — 애그리게이터(링크 역추적 모드: 저장 안 함)·포털·SNS·구인 플랫폼. 정본: sns_sources/exclude_domains.py
from sns_sources.exclude_domains import _ALL as EXCLUDE_DOMAINS  # noqa: E402


# 블로그 콘텐츠팜·후기·뉴스 블로거 — 실측(2026-08-22): '건강백과365', '뉴스인사이더', '나만의 소확행 경제학' 류가 상위
_BLOGGER_BLACKLIST = re.compile(r"뉴스|건강|경제|일상|소확행|정보\s*정리|저널리스트|여행|맛집|리뷰|후기|재테크|부동산|쇼핑")
# 블로그 글은 제목에 공고성 단어가 있어야 후보 (SEO 글 '아역배우 되는법 오디션 공고 신청부터…' 차단)
_BLOG_TITLE_OK = re.compile(r"공고|모집|오디션\s*(?:안내|접수|일정)|캐스팅|구인|채용")
_BLOG_TITLE_BAD = re.compile(r"되는\s*법|준비|합격|팁|총정리|후기|정리|가이드|알아보|비용|학원|레슨|\?")


def _domain(url: str) -> str:
    try:
        h = urlparse(url).hostname or ""
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return ""


class NaverWebScraper(BaseScraper):
    """kind='blog' | 'webkr'"""

    def __init__(self, kind: str = "webkr", keywords: Optional[list[str]] = None, include_untrusted: bool = False):
        assert kind in ENDPOINTS
        self.kind = kind
        self.source_name = "네이버블로그" if kind == "blog" else "네이버웹문서"
        self.keywords = keywords or (KEYWORDS_BLOG if kind == "blog" else KEYWORDS_WEB)
        self.client_id = os.environ.get("NAVER_API_HUB_CLIENT_ID", "")
        self.client_secret = os.environ.get("NAVER_API_HUB_CLIENT_SECRET", "")
        # 검수는 게시물이 아니라 출처(도메인/블로거) 단위: trusted_sources에 있는 출처만 저장, 나머지는 발견 큐에만.
        # (실측: 첫 실행 웹문서 905·블로그 1,009건 통과 — 게시물 단위 pending은 검수 불가능한 양)
        self.include_untrusted = include_untrusted
        self.candidates: dict[str, dict] = {}
        self.details: dict = {}

    def _trusted(self) -> set[str]:
        try:
            from utils.supabase_client import trusted_sources
            return trusted_sources()
        except Exception:
            return set()

    @staticmethod
    def enabled() -> bool:
        return os.environ.get("NAVER_CAFE_ENABLED") == "1" and bool(os.environ.get("NAVER_API_HUB_CLIENT_ID"))

    def _search(self, query: str) -> list[dict]:
        r = requests.get(
            ENDPOINTS[self.kind],
            headers={"X-NCP-APIGW-API-KEY-ID": self.client_id, "X-NCP-APIGW-API-KEY": self.client_secret},
            params={"query": query, "display": DISPLAY, "start": 1, "sort": "date" if self.kind == "blog" else "sim"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json().get("items", [])

    def fetch_items(self) -> list[CafeItem]:
        seen: set[str] = set()
        items: list[CafeItem] = []
        for kw in self.keywords:
            try:
                raw = self._search(kw)
            except Exception as e:
                logger.warning(f"[{self.source_name}] '{kw}' 실패: {e}")
                continue
            for r in raw:
                link = r.get("link", "")
                if not link or link in seen:
                    continue
                seen.add(link)
                if self.kind == "webkr" and EXCLUDE_DOMAINS.search(_domain(link)):
                    continue
                name = _clean(r.get("bloggername", "")) if self.kind == "blog" else _domain(link)
                items.append(CafeItem(
                    title=_clean_title(r.get("title", "")), description=_clean(r.get("description", "")),
                    link=link, cafename=name, cafeurl=r.get("bloggerlink", "") or f"https://{_domain(link)}", keyword=kw,
                ))
            time.sleep(0.1)
        return items

    def scrape(self) -> list[AuditionData]:
        kw_stat: dict[str, dict[str, int]] = {}
        dom_stat: dict[str, dict[str, int]] = {}
        reasons: dict[str, int] = {}
        out: list[AuditionData] = []
        trusted = self._trusted() if not self.include_untrusted else None
        held = 0
        for it in self.fetch_items():
            dom = _domain(it.link) if self.kind == "webkr" else it.cafename
            kw_stat.setdefault(it.keyword, {"fetched": 0, "passed": 0})["fetched"] += 1
            dom_stat.setdefault(dom, {"fetched": 0, "passed": 0})["fetched"] += 1
            if self.kind == "blog":
                if _BLOGGER_BLACKLIST.search(it.cafename):
                    reasons["blogger_blacklist"] = reasons.get("blogger_blacklist", 0) + 1
                    continue
                if not _BLOG_TITLE_OK.search(it.title) or _BLOG_TITLE_BAD.search(it.title):
                    reasons["blog_title"] = reasons.get("blog_title", 0) + 1
                    continue
            ok, reason = is_candidate(it)
            reasons[reason] = reasons.get(reason, 0) + 1
            if not ok or self.is_noise_title(it.title):
                continue
            kw_stat[it.keyword]["passed"] += 1
            dom_stat[dom]["passed"] += 1
            source_name = f"{self.source_name}:{(it.cafename[:20] if self.kind == 'blog' else dom) or dom}"
            # 발견 큐 적립 (도메인/블로거 단위)
            cand_url = f"https://{dom}" if self.kind == "webkr" else (it.cafeurl or f"blog:{it.cafename}")
            c = self.candidates.setdefault(cand_url, {"kind": "domain" if self.kind == "webkr" else "blog",
                                                      "found_by": f"naver_{self.kind}:{it.keyword}", "sample_title": it.title[:80], "hits": 0})
            c["hits"] += 1
            if trusted is not None and source_name not in trusted:
                held += 1
                continue  # 미승인 출처 → 게시물은 저장 안 함(발견 큐에서 도메인 승인 후 유입)
            text = f"{it.title}\n{it.description}"
            m = _EMAIL_RE.search(it.description)
            email = m.group() if m and "*" not in m.group() else None
            label = "블로그" if self.kind == "blog" else "홈페이지"
            out.append(AuditionData(
                title=it.title, company=None, genre=BaseScraper.classify_genre(text),
                deadline=_extract_deadline(text, posted_at=date.today()), apply_email=email,
                description=(f"{it.description}\n\n---\n출처: {label} '{it.cafename}' (요약만 수집 — 전문·지원 방법은 원문 링크 확인)")[:2000],
                requirements=None, source_url=it.link, source_name=source_name,
            ))
        self.details = {"keywords": kw_stat, "domains": dict(sorted(dom_stat.items(), key=lambda kv: -kv[1]["fetched"])[:60]),
                        "reasons": reasons, "candidates": len(self.candidates), "held_untrusted": held}
        logger.info(f"[{self.source_name}] 저장 대상 {len(out)} | 미승인 출처 보류 {held} | 제외 {reasons} | 출처 후보 {len(self.candidates)}")
        return out

    def push_candidates(self) -> int:
        if not self.candidates:
            return 0
        from utils.supabase_client import supabase
        n = 0
        for url, c in self.candidates.items():
            try:
                ex = supabase.table("source_candidates").select("id,hits").eq("url", url).execute().data
                if ex:
                    supabase.table("source_candidates").update({"hits": ex[0]["hits"] + c["hits"], "last_seen": datetime.now(timezone.utc).isoformat()}).eq("id", ex[0]["id"]).execute()
                else:
                    supabase.table("source_candidates").insert({"url": url, "kind": c["kind"], "found_by": c["found_by"], "hits": c["hits"], "sample_title": c["sample_title"]}).execute()
                n += 1
            except Exception as e:
                logger.warning(f"후보 기록 실패 {url}: {str(e)[:80]}")
        return n


if __name__ == "__main__":
    # dry-run: python -m sns_sources.naver_web [blog|webkr] [샘플수]
    import sys
    from pathlib import Path
    from dotenv import load_dotenv
    from collections import Counter
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    kind = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ENDPOINTS else "webkr"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    s = NaverWebScraper(kind, include_untrusted="--all" in sys.argv)   # --all: 미승인 출처도 표시(dry-run 점검용)
    auds = s.scrape()
    print(f"\n[{s.source_name}] 통과 {len(auds)} | 이메일 {sum(1 for a in auds if a.apply_email)} | 마감 {sum(1 for a in auds if a.deadline)}")
    print("도메인/블로거 상위:", Counter(a.source_name for a in auds).most_common(12))
    for a in auds[:n]:
        print(f"[{a.genre}] {a.title[:55]} | {a.source_name} | 마감 {a.deadline} | {'✉' if a.apply_email else ' '} {a.source_url[:70]}")
    if s.candidates:
        print("\n도메인 후보:", sorted(s.candidates.items(), key=lambda kv: -kv[1]["hits"])[:15])
