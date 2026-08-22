"""
세션 브라우저 수집기 — 인스타그램·스레드·X (플랜 E-8, 2026-08-22)

왜 브라우저 세션인가: 31 실측 — 서버 무로그인 요청은 전부 차단(429/302/500), 로그인된 실제 브라우저는 전부 읽힘.
크롤러가 이 PC(가정용 IP)에서 돌므로 Playwright persistent context(전용 프로필 폴더)에 부계정 로그인을 1회 저장해 두고 재사용한다.
사용자 결정(2026-08-22): D4 개정 — 방식 불문, 정확한 내용이 목표. 밴 리스크는 운영자 인지. 사람 속도·소량·요약+출처 링크 원칙.

사용:
  python -m sns_sources.session_browser login             # 창이 뜸 → 인스타/스레드/X 부계정 로그인 → 터미널에서 Enter
  python -m sns_sources.session_browser run --dry-run     # 수집·파싱 결과만 출력 (DB 저장 없음)
  python -m sns_sources.session_browser run               # 저장 (검수 큐 규칙 적용: 신규 계정은 pending)
  python -m sns_sources.session_browser run --platform instagram --accounts-only
환경: SOCIAL_HEADLESS=0 이면 창 표시. SOCIAL_BACKEND=apify 는 백업 경로(미구현 — 세션 차단 시 전환용 인터페이스만).
"""
from __future__ import annotations

import json
import logging
import os
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from scrapers.base import AuditionData, BaseScraper
from sns_sources.instagram_caption import IGPost, parse_caption, is_audition_caption

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
PROFILE_DIR = ROOT / ".browser"                       # gitignore
CONFIG = ROOT / "sns_sources" / "social_accounts.json"
STATE = ROOT / ".browser_state.json"                  # 일일 카운터·마지막 처리 post id

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


@dataclass
class SocialPost:
    platform: str          # instagram | threads | x
    post_id: str
    username: str
    text: str
    url: str
    posted_at: Optional[date] = None


def _load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


def _load_state() -> dict:
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_state(st: dict) -> None:
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")


def _sleep(cfg: dict) -> None:
    lim = cfg.get("limits", {})
    time.sleep(random.uniform(lim.get("delay_min", 2.0), lim.get("delay_max", 6.0)))


def _to_date(ts: int | str | None) -> Optional[date]:
    try:
        if ts is None:
            return None
        if isinstance(ts, (int, float)) or str(ts).isdigit():
            return datetime.fromtimestamp(int(ts), tz=timezone.utc).date()
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).date()
    except Exception:
        return None


# ============================================
# 브라우저
# ============================================

class Session:
    def __init__(self, headless: Optional[bool] = None):
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        if headless is None:
            headless = os.environ.get("SOCIAL_HEADLESS", "1") != "0"
        PROFILE_DIR.mkdir(exist_ok=True)
        self.ctx = self._pw.chromium.launch_persistent_context(
            str(PROFILE_DIR), headless=headless, locale="ko-KR", viewport={"width": 1280, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        self.page = self.ctx.new_page()

    def goto(self, url: str, wait: str = "domcontentloaded") -> None:
        self.page.goto(url, wait_until=wait, timeout=45000)

    def close(self) -> None:
        try:
            self.ctx.close()
        finally:
            self._pw.stop()

    # --- 로그인 상태 ---
    def logged_in(self, platform: str) -> bool:
        checks = {
            "instagram": ("https://www.instagram.com/", "/accounts/login"),
            "threads": ("https://www.threads.net/", "/login"),
            "x": ("https://x.com/home", "/i/flow/login"),
        }
        url, login_marker = checks[platform]
        try:
            self.goto(url)
            time.sleep(2)
            return login_marker not in self.page.url
        except Exception:
            return False


# ============================================
# 어댑터 — 인스타그램
# ============================================

_IG_SHORTCODE = re.compile(r"/(?:p|reel)/([A-Za-z0-9_-]{5,})/")


def ig_profile_codes(s: Session, user: str, limit: int) -> list[str]:
    s.goto(f"https://www.instagram.com/{user}/")
    time.sleep(3)
    for _ in range(2):  # 살짝 스크롤해 12개 이상 로드
        s.page.mouse.wheel(0, 1500)
        time.sleep(1.5)
    hrefs = s.page.eval_on_selector_all("a[href*='/p/'], a[href*='/reel/']", "els => els.map(e => e.getAttribute('href'))")
    codes: list[str] = []
    for h in hrefs or []:
        m = _IG_SHORTCODE.search(h or "")
        if m and m.group(1) not in codes:
            codes.append(m.group(1))
    return codes[:limit]


def ig_post(s: Session, code: str) -> Optional[SocialPost]:
    s.goto(f"https://www.instagram.com/p/{code}/")
    time.sleep(2)
    html = s.page.content()
    # 페이지 내 JSON: "caption":{"text":"..."} / "taken_at":1712345678 / "owner":{"username":"x"}
    cap = None
    m = re.search(r'"caption":\{"text":"((?:[^"\\]|\\.)*)"', html)
    if m:
        cap = json.loads(f'"{m.group(1)}"')
    if not cap:
        og = s.page.query_selector("meta[property='og:description']")
        cap = (og.get_attribute("content") if og else "") or ""
        cap = re.sub(r'^.*?on Instagram: "', "", cap).rstrip('"')
    ts = re.search(r'"taken_at":(\d{9,11})', html)
    un = re.search(r'"owner":\{[^}]*"username":"([^"]+)"', html) or re.search(r'"username":"([^"]+)"', html)
    if not cap or len(cap) < 10:
        return None
    return SocialPost("instagram", code, un.group(1) if un else "", cap, f"https://www.instagram.com/p/{code}/",
                      _to_date(int(ts.group(1))) if ts else None)


def ig_search_codes(s: Session, keyword: str, limit: int) -> list[str]:
    s.goto(f"https://www.instagram.com/explore/search/keyword/?q={quote(keyword)}")
    time.sleep(4)
    s.page.mouse.wheel(0, 1200)
    time.sleep(1.5)
    hrefs = s.page.eval_on_selector_all("a[href*='/p/'], a[href*='/reel/']", "els => els.map(e => e.getAttribute('href'))")
    out: list[str] = []
    for h in hrefs or []:
        m = _IG_SHORTCODE.search(h or "")
        if m and m.group(1) not in out:
            out.append(m.group(1))
    return out[:limit]


# ============================================
# 어댑터 — 스레드
# ============================================

_TH_POST = re.compile(r"/@([A-Za-z0-9_.]+)/post/([A-Za-z0-9_-]+)")


def threads_profile_posts(s: Session, user: str, limit: int) -> list[SocialPost]:
    s.goto(f"https://www.threads.net/@{user}")
    time.sleep(3)
    s.page.mouse.wheel(0, 1500)
    time.sleep(1.5)
    hrefs = s.page.eval_on_selector_all("a[href*='/post/']", "els => els.map(e => e.getAttribute('href'))")
    seen: list[tuple[str, str]] = []
    for h in hrefs or []:
        m = _TH_POST.search(h or "")
        if m and (m.group(1), m.group(2)) not in seen:
            seen.append((m.group(1), m.group(2)))
    posts: list[SocialPost] = []
    for u, code in seen[:limit]:
        p = threads_post(s, u, code)
        if p:
            posts.append(p)
        _sleep(_load_config())
    return posts


def threads_post(s: Session, user: str, code: str) -> Optional[SocialPost]:
    url = f"https://www.threads.net/@{user}/post/{code}"
    s.goto(url)
    time.sleep(2)
    og = s.page.query_selector("meta[property='og:description']")
    text = (og.get_attribute("content") if og else "") or ""
    t = s.page.query_selector("time[datetime]")
    posted = _to_date(t.get_attribute("datetime")) if t else None
    if len(text) < 10:
        return None
    return SocialPost("threads", code, user, text, url, posted)


def threads_search_posts(s: Session, keyword: str, limit: int) -> list[SocialPost]:
    s.goto(f"https://www.threads.net/search?q={quote(keyword)}&serp_type=default")
    time.sleep(4)
    hrefs = s.page.eval_on_selector_all("a[href*='/post/']", "els => els.map(e => e.getAttribute('href'))")
    pairs: list[tuple[str, str]] = []
    for h in hrefs or []:
        m = _TH_POST.search(h or "")
        if m and (m.group(1), m.group(2)) not in pairs:
            pairs.append((m.group(1), m.group(2)))
    out: list[SocialPost] = []
    for u, code in pairs[:limit]:
        p = threads_post(s, u, code)
        if p:
            out.append(p)
        _sleep(_load_config())
    return out


# ============================================
# 어댑터 — X
# ============================================

def _x_collect_tweets(s: Session, limit: int) -> list[SocialPost]:
    time.sleep(4)
    out: list[SocialPost] = []
    for _ in range(3):
        items = s.page.eval_on_selector_all(
            "article[data-testid='tweet']",
            """els => els.map(a => {
                const t = a.querySelector("div[data-testid='tweetText']");
                const link = Array.from(a.querySelectorAll("a[href*='/status/']")).map(x => x.getAttribute('href')).find(h => /\\/status\\/\\d+$/.test(h)) || '';
                const time = a.querySelector('time');
                return {text: t ? t.innerText : '', link, time: time ? time.getAttribute('datetime') : null};
            })""",
        ) or []
        for it in items:
            m = re.search(r"/([A-Za-z0-9_]+)/status/(\d+)", it.get("link") or "")
            if not m:
                continue
            pid = m.group(2)
            if any(p.post_id == pid for p in out) or len(it.get("text") or "") < 10:
                continue
            out.append(SocialPost("x", pid, m.group(1), it["text"], f"https://x.com{it['link']}", _to_date(it.get("time"))))
        if len(out) >= limit:
            break
        s.page.mouse.wheel(0, 2500)
        time.sleep(2)
    return out[:limit]


def x_search(s: Session, keyword: str, limit: int) -> list[SocialPost]:
    s.goto(f"https://x.com/search?q={quote(keyword)}&src=typed_query&f=live")
    return _x_collect_tweets(s, limit)


def x_user_timeline(s: Session, user: str, limit: int) -> list[SocialPost]:
    s.goto(f"https://x.com/{user}")
    return _x_collect_tweets(s, limit)


# ============================================
# 수집 오케스트레이션
# ============================================

class SocialSessionScraper(BaseScraper):
    source_name = "SNS세션"

    def __init__(self, platforms: Optional[list[str]] = None, accounts_only: bool = False, dry_run: bool = False):
        self.cfg = _load_config()
        self.platforms = platforms or ["instagram", "threads", "x"]
        self.accounts_only = accounts_only
        self.dry_run = dry_run
        self.posts: list[SocialPost] = []
        self.candidates: dict[str, dict] = {}   # url → {kind, found_by, sample_title}
        self.details: dict = {}

    def _known_urls(self, urls: list[str]) -> set[str]:
        if self.dry_run:
            return set()
        try:
            from utils.supabase_client import supabase
            out: set[str] = set()
            for i in range(0, len(urls), 100):
                rows = supabase.table("auditions").select("source_url").in_("source_url", urls[i:i + 100]).execute().data or []
                out.update(r["source_url"] for r in rows)
            return out
        except Exception:
            return set()

    def _note_candidate(self, platform: str, username: str, found_by: str, title: str) -> None:
        if not username:
            return
        wl = set(self.cfg.get(platform, {}).get("accounts", []))
        if username in wl:
            return
        base = {"instagram": "https://www.instagram.com/{u}/", "threads": "https://www.threads.net/@{u}", "x": "https://x.com/{u}"}[platform]
        url = base.format(u=username)
        c = self.candidates.setdefault(url, {"kind": platform, "found_by": found_by, "sample_title": title[:80], "hits": 0})
        c["hits"] += 1

    def collect(self, s: Session) -> list[SocialPost]:
        lim = self.cfg.get("limits", {})
        per_acc, per_kw, daily = lim.get("per_account", 12), lim.get("per_keyword", 20), lim.get("per_platform_daily", 150)
        state = _load_state()
        today = date.today().isoformat()
        if state.get("date") != today:
            state = {"date": today, "count": {}}
        stats: dict[str, dict] = {}

        for platform in self.platforms:
            pc = self.cfg.get(platform, {})
            used = state["count"].get(platform, 0)
            st = stats.setdefault(platform, {"accounts": 0, "posts": 0, "search_posts": 0, "login": True})
            if not s.logged_in(platform):
                st["login"] = False
                logger.error(f"[{platform}] 로그인 안 됨 — `python -m sns_sources.session_browser login` 필요. 건너뜀")
                continue
            # 1) 화이트리스트 계정
            for user in pc.get("accounts", []):
                if used >= daily:
                    break
                try:
                    if platform == "instagram":
                        codes = ig_profile_codes(s, user, per_acc)
                        new_codes = [c for c in codes if f"https://www.instagram.com/p/{c}/" not in self._known_urls([f"https://www.instagram.com/p/{c}/" for c in codes])]
                        for c in new_codes:
                            p = ig_post(s, c)
                            if p:
                                p.username = p.username or user
                                self.posts.append(p); used += 1; st["posts"] += 1
                            _sleep(self.cfg)
                    elif platform == "threads":
                        ps = threads_profile_posts(s, user, per_acc)
                        self.posts.extend(ps); used += len(ps); st["posts"] += len(ps)
                    else:
                        ps = x_user_timeline(s, user, per_acc)
                        self.posts.extend(ps); used += len(ps); st["posts"] += len(ps)
                    st["accounts"] += 1
                except Exception as e:
                    logger.warning(f"[{platform}] @{user} 실패: {str(e)[:120]}")
                _sleep(self.cfg)
            # 2) 키워드 검색 (발견 + 수집)
            if not self.accounts_only:
                for kw in pc.get("keywords", []):
                    if used >= daily:
                        break
                    try:
                        if platform == "instagram":
                            for c in ig_search_codes(s, kw, per_kw):
                                p = ig_post(s, c)
                                if p:
                                    self.posts.append(p); used += 1; st["search_posts"] += 1
                                    self._note_candidate(platform, p.username, f"instagram_explore:{kw}", p.text[:80])
                                _sleep(self.cfg)
                        elif platform == "threads":
                            ps = threads_search_posts(s, kw, per_kw)
                        else:
                            ps = x_search(s, kw, per_kw)
                        if platform != "instagram":
                            for p in ps:
                                self.posts.append(p); used += 1; st["search_posts"] += 1
                                self._note_candidate(platform, p.username, f"{platform}_search:{kw}", p.text[:80])
                    except Exception as e:
                        logger.warning(f"[{platform}] 검색 '{kw}' 실패: {str(e)[:120]}")
                    _sleep(self.cfg)
            state["count"][platform] = used
            _save_state(state)
        self.details = {"platforms": stats, "candidates": len(self.candidates)}
        return self.posts

    def scrape(self) -> list[AuditionData]:
        s = Session()
        try:
            self.collect(s)
        finally:
            s.close()
        out: list[AuditionData] = []
        seen: set[str] = set()
        for p in self.posts:
            if p.url in seen:
                continue
            seen.add(p.url)
            post = IGPost(shortcode=p.post_id, username=p.username, caption=p.text, posted_at=p.posted_at, url=p.url, platform=p.platform)
            a = parse_caption(post)
            if a:
                out.append(a)
        self.details["parsed"] = len(out)
        logger.info(f"[SNS세션] 게시물 {len(self.posts)} → 오디션 후보 {len(out)} | {self.details}")
        return out

    def push_candidates(self) -> int:
        if self.dry_run or not self.candidates:
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


# ============================================
# CLI
# ============================================

def _cmd_login() -> None:
    s = Session(headless=False)
    for url in ("https://www.instagram.com/accounts/login/", "https://www.threads.net/login", "https://x.com/i/flow/login"):
        s.ctx.new_page().goto(url)
    print("\n창 3개(인스타·스레드·X)에서 부계정으로 로그인하세요. 끝나면 여기서 Enter …")
    try:
        input()
    except EOFError:
        time.sleep(180)
    for pf in ("instagram", "threads", "x"):
        print(f"  {pf}: {'로그인 OK' if s.logged_in(pf) else '로그인 안 됨'}")
    s.close()
    print("세션이 crawler/.browser/ 에 저장됐습니다.")


def _cmd_run(args) -> None:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    platforms = [args.platform] if args.platform else None
    sc = SocialSessionScraper(platforms=platforms, accounts_only=args.accounts_only, dry_run=args.dry_run)
    auds = sc.scrape()
    print(f"\n게시물 {len(sc.posts)}건 → 오디션 후보 {len(auds)}건 | 계정 후보 {len(sc.candidates)}\n")
    for a in auds[: args.show]:
        print(f"[{a.genre}] {a.title[:55]} | {a.source_name} | 마감 {a.deadline} | {'✉' if a.apply_email else ' '} {a.source_url}")
    if sc.candidates:
        print("\n계정 후보(상위):", ", ".join(f"{u.split('/')[-1] or u.split('/')[-2]}×{c['hits']}" for u, c in sorted(sc.candidates.items(), key=lambda kv: -kv[1]['hits'])[:15]))
    if args.dry_run:
        print("\n(dry-run) 저장 안 함")
        return
    from utils.supabase_client import upsert_auditions, pop_classify_stats
    from utils import crawl_log
    today = date.today()
    fresh = [a for a in auds if not (a.deadline and a.deadline < today)]
    saved = upsert_auditions(fresh)
    st = pop_classify_stats()
    n = sc.push_candidates()
    crawl_log.record("SNS세션", collected=len(sc.posts), saved=saved, expired=len(auds) - len(fresh),
                     by_keyword=st["keyword"], by_rule=st["rule"], details=sc.details)
    print(f"✓ 저장 {saved}건 (pending {st.get('pending', 0)}) / 계정 후보 기록 {n}")


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("login")
    r = sub.add_parser("run")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--platform", choices=["instagram", "threads", "x"])
    r.add_argument("--accounts-only", action="store_true")
    r.add_argument("--show", type=int, default=30)
    a = ap.parse_args()
    if a.cmd == "login":
        _cmd_login()
    else:
        _cmd_run(a)
