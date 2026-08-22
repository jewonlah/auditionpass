"""
기획사·방송사·공공기관 공식 오디션/채용 페이지 감시 (플랜 E-5, 2026-08-22)

페이지 1개 = 공고 1건(또는 0건). 본문을 규칙 추출(제목·기간·이메일·구글폼)하고 **내용 해시가 바뀌었을 때만** 새 레코드를 만든다
(source_url = 페이지URL#해시8 → 이전 레코드는 만료 정책으로 내려감). D4 "기획사 공식 페이지" — 1차 출처·검증 배지 재료.
상태 파일: crawler/.official_state.json (gitignore)
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

from scrapers.base import AuditionData, BaseScraper
from scrapers.generic_board import UA, _longest_block, _text_of, _title
from utils.summarize import summarize

logger = logging.getLogger(__name__)
STATE = Path(__file__).resolve().parent.parent / ".official_state.json"


@dataclass
class Page:
    org: str
    url: str
    kind: str = "기획사"     # 기획사 | 방송사 | 공공
    render: bool = False
    must: str = r"오디션|모집|채용|캐스팅"   # 본문에 이 패턴이 있어야 공고로 인정


PAGES: list[Page] = [
    Page("스타쉽엔터테인먼트", "https://www.starship-ent.com/audition/info"),
    Page("JYP Publishing", "https://www.jyppub.com/ko/audition"),
    Page("WAKEONE", "https://wake-one.com/en/audition/"),
    Page("카카오엔터테인먼트", "https://audition.kakaoent.com/", render=True),  # requests는 연결 실패 → 브라우저 렌더
    Page("INNIT", "https://artworker.global/project/1043"),
    Page("아티브", "https://groupmain.co.kr/audition"),
    Page("국립극단", "https://www.ntck.or.kr/ko/audition", kind="공공"),
    Page("영아츠컴퍼니", "http://youngarts.co.kr/audition2026"),
]
_GFORM = re.compile(r"https://(?:docs\.google\.com/forms|forms\.gle)/[^\s\"'<>]+")


def _load() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    except Exception:
        return {}


def _save(st: dict) -> None:
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")


class OfficialPagesScraper(BaseScraper):
    source_name = "공식페이지"

    def __init__(self, pages: Optional[list[Page]] = None, force: bool = False):
        self.pages = pages or PAGES
        self.force = force
        self.details: dict = {}

    def _fetch(self, p: Page) -> Optional[str]:
        try:
            if p.render:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as pw:
                    b = pw.chromium.launch(headless=True)
                    pg = b.new_page(locale="ko-KR")
                    pg.goto(p.url, wait_until="networkidle", timeout=45000)
                    pg.wait_for_timeout(1500)
                    html = pg.content()
                    b.close()
                return html
            r = requests.get(p.url, headers=UA, timeout=20)
            r.raise_for_status()
            if not r.encoding or r.encoding.lower() in ("iso-8859-1", "ascii"):
                r.encoding = r.apparent_encoding
            return r.text
        except Exception as e:
            logger.warning(f"[공식페이지] {p.org} 요청 실패: {str(e)[:80]}")
            return None

    def check(self, p: Page, state: dict) -> Optional[AuditionData]:
        html = self._fetch(p)
        if not html:
            return None
        soup = _text_of(BeautifulSoup(html, "html.parser"))
        body = _longest_block(soup)
        if not re.search(p.must, body):
            return None
        norm = re.sub(r"\s+", " ", body)[:6000]
        h = hashlib.sha1(norm.encode("utf-8")).hexdigest()[:8]
        prev = state.get(p.url)
        if prev == h and not self.force:
            return None  # 변화 없음
        state[p.url] = h
        title = _title(soup, None)
        head = re.search(r"[^\n]{6,80}(?:오디션|모집|채용|캐스팅)[^\n]{0,40}", body)
        if head and len(head.group(0)) > len(title) * 0.6:
            title = head.group(0).strip()
        title = f"[{p.org}] {title}"[:150]
        email = self.extract_email(body)
        deadline = self.parse_deadline_smart(body) if re.search(r"마감|접수|기간|까지", body) else None
        gform = _GFORM.search(html)
        desc = summarize(body, max_chars=600)
        if gform:
            desc += f"\n지원 링크: {gform.group(0)}"
        desc += f"\n\n---\n출처: {p.org} 공식 페이지 ({p.kind} · 1차 출처)"
        return AuditionData(
            title=title, company=p.org, genre=self.classify_genre(f"{title}\n{body}"), deadline=deadline,
            apply_email=email, description=desc[:2000], requirements=None,
            source_url=f"{p.url}#{h}", source_name=f"기획사:{p.org}" if p.kind == "기획사" else f"{p.kind}:{p.org}",
        )

    def scrape(self) -> list[AuditionData]:
        state = _load()
        out: list[AuditionData] = []
        checked = 0
        for p in self.pages:
            checked += 1
            a = self.check(p, state)
            if a:
                out.append(a)
        _save(state)
        self.details = {"pages": checked, "changed": len(out)}
        logger.info(f"[공식페이지] {checked}페이지 점검 → 변경/신규 {len(out)}")
        return out


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    s = OfficialPagesScraper(force="--force" in sys.argv)
    for a in s.scrape():
        print(f"[{a.genre}] {a.title[:60]} | 마감 {a.deadline} | {'✉' if a.apply_email else ' '} {a.source_url[:60]}")
        print("   " + (a.description or "")[:200].replace("\n", " / "))
