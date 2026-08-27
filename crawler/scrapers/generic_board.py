"""
범용 게시판 스크레이퍼 (플랜 E-4, 2026-08-22) — 사이트 추가 = 설정 1줄, 셀렉터 최소.

설정(BOARDS)마다: 목록 URL, 상세 링크 정규식(또는 id 정규식 + 상세 템플릿), 제목/본문 힌트.
상세 페이지는 script/style/nav/footer 제거 후 텍스트 → 제목(og:title/h1/<title>), 본문(가장 긴 텍스트 블록),
이메일·마감일·장소·전화는 BaseScraper 유틸, 요약은 utils.summarize(비용 0), 카테고리는 upsert 단계 classifier.
mode:
  'post'  — 공고를 저장 (1차 출처)
  'index' — 2차 출처(학원·모음 사이트): 제목+링크만 저장하고 본문은 원문 유도, 품질 점수는 낮게
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from scrapers.base import AuditionData, BaseScraper
from utils.summarize import summarize

logger = logging.getLogger(__name__)

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
}
_AUDITION_WORDS = re.compile(r"오디션|모집|캐스팅|구인|배역|출연|단원|채용|공고")
_SKIP_WORDS = re.compile(
    r"강사.{0,6}모집|교육생|인턴|세미나|워크숍\s*참가|강의|수강|합격자|결과\s*발표|후기|공연\s*안내|티켓|"
    r"요리|경연대회|레시피|푸드|뷰티\s*대회|네일\s*대회|메이크업\s*대회|헤어\s*대회|"
    r"기자단|홍보대사|서포터즈|자원봉사|봉사자|평가단|멘토|특파원|동아리|기획단|참여단|체험단|장학생|공모전\s*수상"
)
_LABEL_WORDS = re.compile(r"마감|접수|모집|지원|일정|자격|배역|장소|페이|출연료|문의|이메일|연락처")


@dataclass
class Board:
    name: str                      # source_name (출처 배지)
    list_urls: list[str]
    link_re: str                   # 상세 링크 정규식 (href 대상). 그룹1 = id 가 필요한 경우 detail_tpl 사용
    detail_tpl: Optional[str] = None   # 예: "http://site/view.asp?id={id}" — link_re 그룹1을 {id}에
    mode: str = "post"             # post | index
    max_items: int = 40
    title_sel: Optional[str] = None    # 상세 제목 CSS (없으면 og:title → h1~h3 → <title>)
    body_sel: Optional[str] = None     # 상세 본문 CSS (없으면 가장 긴 블록)
    title_filter: bool = True          # 제목에 공고성 단어가 있어야 수집
    delay: float = 1.2
    enabled: bool = True
    notes: str = ""
    # JS 폼 제출형 게시판(플레이DB): 상세는 POST, 제목은 목록에서 (id, 제목) 쌍으로
    detail_post: Optional[dict] = None     # POST 고정 필드. id는 "No" 키로 추가됨 (post_id_field)
    post_id_field: str = "No"
    list_title_re: Optional[str] = None    # 목록에서 (id, 제목) 추출 정규식 — 그룹1=id, 그룹2=제목
    id_re: Optional[str] = None            # href형 게시판에서 링크→id 추출 (list_title_re의 id와 매칭해 제목 사전 필터)
    skip_re: Optional[str] = None          # 상세 본문에 이 패턴이 있으면 제외 (예: 현재상태 종료)
    render: bool = False                   # JS 렌더 필요(카카오톡 채널·SPA) → Playwright로 목록·상세 로드


BOARDS: list[Board] = [
    Board("콘테스트코리아", ["https://contestkorea.com/sub/list.php?int_gbn=1&Txt_bcode=031610001"],
          r"view\.php\?[^\"]*str_no=\d+", id_re=r"str_no=(\d+)",
          list_title_re=r'str_no=(\d+)"[^>]*>\s*<span class="title">([^<]{4,120})<',
          notes="대회·공모전 > 요리·뷰티·배우·오디션(Txt_bcode 031610001). 목록은 타 분야 섞임 → 목록 제목으로 사전 필터 후 상세 요청"),
    Board("국립극단", ["https://www.ntck.or.kr/ko/audition"], r"/ko/audition/\d+", max_items=15, notes="공공 — 시즌단원·워크숍 오디션"),
    Board("이벤트넷", ["https://eventnet.co.kr/board/freead/", "https://eventnet.co.kr/board/free/"],
          r"/board/free(?:ad)?/\?cf=view&seq=\d+", max_items=30, notes="행사 MC·모델·프로모터 구인"),
    Board("플레이DB", ["http://www.playdb.co.kr/community/Publicity_list.asp?bbsno=29"],
          r"goDetail\('(\d+)'\)", detail_tpl="http://www.playdb.co.kr/community/Publicity_Detail.asp",
          detail_post={"bbsno": "29", "page": "1", "Sort": "", "SFlag": "I", "SText": ""},
          list_title_re=r"goDetail\('(\d+)'\)\"?>([^<]{5,150})<", skip_re=r"현재상태\s*종료",
          max_items=30, notes="D4 지정 소스. 목록 JS goDetail(No) → Publicity_Detail.asp POST(searchform 필드 실측). "
                              "상세에 공연명·업체명·모집기간·현재상태 구조화. 2024년 이후 글이 드묾"),
    Board("오톡오디션정보", ["http://www.ohtalk.net/xe/index.php?mid=board_ZxMh03"], r"document_srl=\d+", mode="index",
          enabled=False, notes="2차 출처(기획사 오디션 모음) — 링크 인덱스. 목록 링크 형식 확인 필요"),
]


def _abs(base: str, href: str) -> str:
    return urljoin(base, href)


def _text_of(soup: BeautifulSoup) -> str:
    for t in soup(["script", "style", "nav", "header", "footer", "noscript", "iframe"]):
        t.decompose()
    return soup


def _longest_block(soup: BeautifulSoup) -> str:
    """본문 후보 블록 선택 — 길이가 아니라 '공고 라벨 밀도'(마감·접수·배역·자격…)가 높은 블록.
    실측: 길이 기준은 내비게이션/카테고리 메뉴 블록('대외활동 대회·공모전 …')을 고른다."""
    best, best_score = "", 0.0
    for el in soup.find_all(["article", "section", "div", "td"]):
        txt = el.get_text("\n", strip=True)
        n = len(txt)
        if n < 120 or n > 12000 or txt.count("\n") > 400:
            continue
        labels = len(_LABEL_WORDS.findall(txt))
        menu_penalty = txt.count("•") + txt.count("|") * 0.5
        score = labels * 40 + min(n, 3000) / 30 - menu_penalty * 3
        if score > best_score:
            best, best_score = txt, score
    return best or soup.get_text("\n", strip=True)[:4000]


def _title(soup: BeautifulSoup, sel: Optional[str]) -> str:
    if sel:
        el = soup.select_one(sel)
        if el and el.get_text(strip=True):
            return el.get_text(strip=True)
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        t = og["content"].strip()
        if len(t) >= 6:
            return t
    for h in soup.find_all(["h1", "h2", "h3"]):
        t = h.get_text(strip=True)
        if 6 <= len(t) <= 150:
            return t
    t = soup.title.get_text(strip=True) if soup.title else ""
    return re.split(r"\s[\-|–:]\s", t)[0][:150]


class GenericBoardScraper(BaseScraper):
    def __init__(self, board: Board):
        self.board = board
        self.source_name = board.name
        self.base_url = board.list_urls[0]
        self.details: dict = {}

    _browser = None  # Playwright (render=True 보드 공유)

    def _render(self, url: str) -> Optional[str]:
        """JS 렌더 페이지 HTML (Playwright headless). 한 인스턴스 재사용, 실패 시 None."""
        try:
            if GenericBoardScraper._browser is None:
                from playwright.sync_api import sync_playwright
                pw = sync_playwright().start()
                GenericBoardScraper._browser = (pw, pw.chromium.launch(headless=True))
            _, br = GenericBoardScraper._browser
            pg = br.new_page(locale="ko-KR")
            pg.goto(url, wait_until="networkidle", timeout=45000)
            pg.wait_for_timeout(1500)
            pg.mouse.wheel(0, 1500)
            pg.wait_for_timeout(800)
            html = pg.content()
            pg.close()
            return html
        except Exception as e:
            logger.warning(f"[{self.source_name}] 렌더 실패 {url[:80]}: {str(e)[:80]}")
            return None

    def _get(self, url: str, post: Optional[dict] = None) -> Optional[requests.Response]:
        if self.board.render and post is None:
            html = self._render(url)
            if html is None:
                return None
            return type("R", (), {"text": html, "status_code": 200})()
        try:
            if post is not None:
                r = requests.post(url, data=post, headers={**UA, "Referer": self.base_url}, timeout=20)
            else:
                r = requests.get(url, headers=UA, timeout=20)
            r.raise_for_status()
            if not r.encoding or r.encoding.lower() in ("iso-8859-1", "ascii"):
                r.encoding = r.apparent_encoding
            return r
        except Exception as e:
            logger.warning(f"[{self.source_name}] 요청 실패 {url[:80]}: {str(e)[:80]}")
            return None

    @staticmethod
    def _email_not_site(body: str, url: str) -> Optional[str]:
        """본문 이메일 중 사이트 자체 도메인(푸터·관리자)과 같은 건 제외 — 원클릭 오발송 방어(30 §1 4번, 2-2).
        본문 전체에서 첫 이메일을 쓰지 않고, '지원/접수/문의/이메일' 라벨 근처 우선."""
        from urllib.parse import urlparse
        host = (urlparse(url).hostname or "").lower()
        site = ".".join(host.split(".")[-2:]) if host else ""
        cands = re.findall(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", body)
        noise = ("example.com", "test.com", "noreply", "no-reply", "webmaster", "admin@", "info@", "help@", "support@")
        good = [e for e in cands if site and not e.lower().endswith(site) and not any(n in e.lower() for n in noise)]
        if not good:
            return None
        near = re.search(r"(?:지원|접수|문의|이메일|메일|프로필)[^\n]{0,60}?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})", body)
        if near and near.group(1) in good:
            return near.group(1)
        return good[0]

    def list_links(self) -> list[str]:
        rx = re.compile(self.board.link_re)
        links: list[str] = []
        self._ids: dict[str, str] = {}        # url → id (POST형)
        self._titles: dict[str, str] = {}     # url → 목록 제목
        for lu in self.board.list_urls:
            r = self._get(lu)
            if not r:
                continue
            html = r.text
            if self.board.list_title_re:
                for m in re.finditer(self.board.list_title_re, html):
                    key = m.group(1)
                    self._titles[key] = re.sub(r"\s+", " ", m.group(2)).strip()
            if self.board.detail_tpl:
                for m in rx.finditer(html):
                    pid = m.group(1)
                    u = self.board.detail_tpl.format(id=pid) if "{id}" in self.board.detail_tpl else f"{self.board.detail_tpl}#{pid}"
                    if u not in links:
                        links.append(u)
                        self._ids[u] = pid
            else:
                for href in re.findall(r'href="([^"]+)"', html):
                    href = href.replace("&amp;", "&")
                    if rx.search(href):
                        u = _abs(lu, href)
                        if u in links:
                            continue
                        pid = None
                        if self.board.id_re:
                            mi = re.search(self.board.id_re, href)
                            pid = mi.group(1) if mi else None
                        # 목록 제목 사전 필터 — 상세 요청 전에 비공고 제목을 거른다 (요청 수 절감)
                        lt = self._titles.get(pid or "")
                        if self.board.title_filter and lt and (not _AUDITION_WORDS.search(lt) or _SKIP_WORDS.search(lt)):
                            continue
                        links.append(u)
                        if pid:
                            self._ids[u] = pid
            time.sleep(self.board.delay)
        return links[: self.board.max_items]

    def parse_detail(self, url: str) -> Optional[AuditionData]:
        pid = getattr(self, "_ids", {}).get(url)
        post = None
        if self.board.detail_post is not None and pid:
            post = {**self.board.detail_post, self.board.post_id_field: pid}
        r = self._get(url.split("#")[0], post=post)
        if not r:
            return None
        soup = _text_of(BeautifulSoup(r.text, "html.parser"))
        list_title = getattr(self, "_titles", {}).get(pid or "", "")
        # POST형(플레이DB)은 상세 제목이 없어 목록 제목 사용. 그 외는 상세(og:title)가 정확(목록은 말줄임)
        title = list_title if self.board.detail_post else (_title(soup, self.board.title_sel) or list_title)
        if self.board.title_filter and (not _AUDITION_WORDS.search(title) or _SKIP_WORDS.search(title)):
            return None
        body = ""
        if self.board.body_sel:
            el = soup.select_one(self.board.body_sel)
            body = el.get_text("\n", strip=True) if el else ""
        if not body:
            body = _longest_block(soup)
        if self.board.skip_re and re.search(self.board.skip_re, body):
            return None
        if self.board.mode == "index":
            body = body[:300]
        text = f"{title}\n{body}"
        email = self._email_not_site(body, url)
        # 마감일: 범위 "A ~ B"의 종료일 우선 → 마감 라벨 근처 → 첫 날짜 (base.parse_deadline_smart, 2-3)
        deadline = self.parse_deadline_smart(body, require_label=True) if re.search(r"마감|접수|모집\s*기간|까지", body) else None
        desc = summarize(body, max_chars=600) if self.board.mode == "post" else f"{body[:200]}…"
        footer = f"\n\n---\n출처: {self.source_name} ({'요약' if self.board.mode == 'post' else '링크 인덱스'} — 전문·지원 방법은 원문 링크 확인)"
        comp = re.search(r"(?:업체명|주최|제작사?)\s*[:：]?\s*([^\n/|]{2,40})", body)
        return AuditionData(
            title=title[:150], company=(comp.group(1).strip() if comp else (self.source_name if self.board.mode == "post" else None)),
            genre=self.classify_genre(text), deadline=deadline, apply_email=email,
            description=(desc + footer)[:2000], requirements=None, source_url=url, source_name=self.source_name,
        )

    def scrape(self) -> list[AuditionData]:
        links = self.list_links()
        out: list[AuditionData] = []
        skipped = 0
        for u in links:
            a = self.parse_detail(u)
            if a:
                out.append(a)
            else:
                skipped += 1
            time.sleep(self.board.delay)
        self.details = {"links": len(links), "parsed": len(out), "skipped": skipped}
        logger.info(f"[{self.source_name}] 링크 {len(links)} → 공고 {len(out)} (제외 {skipped})")
        return out


def all_scrapers(enabled_only: bool = True) -> list[GenericBoardScraper]:
    return [GenericBoardScraper(b) for b in BOARDS if b.enabled or not enabled_only]


if __name__ == "__main__":
    # dry-run: python -m scrapers.generic_board [보드이름]
    import sys
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    want = sys.argv[1] if len(sys.argv) > 1 else None
    for s in all_scrapers(enabled_only=not want):
        if want and s.source_name != want:
            continue
        auds = s.scrape()
        print(f"\n== {s.source_name}: {len(auds)}건 | 이메일 {sum(1 for a in auds if a.apply_email)} | 마감 {sum(1 for a in auds if a.deadline)}")
        for a in auds[:12]:
            print(f"  [{a.genre}] {a.title[:60]} | 마감 {a.deadline} | {'✉' if a.apply_email else ' '} {a.source_url[:70]}")
            print("     " + (a.description or "")[:140].replace("\n", " / "))
