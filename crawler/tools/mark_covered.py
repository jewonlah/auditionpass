# -*- coding: utf-8 -*-
"""이미 수집 중인 도메인을 발견 큐에서 걸러내기 — source_candidates.covered_by 표시.

배경(2026-08-28): 발견 큐 604건 중 1위 contestkorea.com(1,213회)·2위 ohtalk.net(641회)이
둘 다 이미 generic_board 로 수집 중이었다. 발견 큐가 "이미 보고 있는 곳"을 중복으로
올리고 있어, 승인 판단이 오염된다.

커버 판정 근거(설정을 import 해서 뽑는다 — 정규식으로 긁지 않는다):
  1. scrapers/generic_board.py  BOARDS       게시판형 수집 대상
  2. scrapers/official_pages.py PAGES        고정 페이지 변경 감시 대상
  3. scrapers/*.py              전용 스크래퍼 (캐스팅나라·스탈렛 등)
  4. sns_sources/exclude_domains AGGREGATORS 경쟁 애그리게이터 — 저장 금지
  5. sns_sources/exclude_domains PORTALS     포털·SNS — 별도 채널이거나 대상 아님
  6. trusted_sources 테이블                   이미 신뢰 출처로 등록된 곳

**status 는 건드리지 않는다.** covered_by 만 채우고, 판단은 /admin/candidates 에서 사람이 한다.

사용: python tools/mark_covered.py [--dry-run]
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))
from supabase import create_client


def host_of(url: str) -> str:
    """도메인만 남긴다. www. 는 떼고 소문자로."""
    if not url:
        return ""
    u = url if "://" in url else "https://" + url
    try:
        h = urlparse(u).netloc.lower()
    except ValueError:
        return ""
    return h[4:] if h.startswith("www.") else h


def registrable(host: str) -> str:
    """서브도메인 차이를 흡수하기 위한 뒤 2~3레벨. 완전한 PSL 은 아니지만
    .co.kr / .or.kr / .go.kr / .ne.kr / .re.kr 등 한국 2단계 TLD 는 맞춘다."""
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    two = ".".join(parts[-2:])
    if two in {"co.kr", "or.kr", "go.kr", "ne.kr", "re.kr", "pe.kr", "ac.kr", "com.au", "co.jp"}:
        return ".".join(parts[-3:])
    return two


def collect_covered() -> dict[str, str]:
    """도메인 → 커버 근거 라벨."""
    covered: dict[str, str] = {}

    def add(url: str, label: str) -> None:
        h = host_of(url)
        if not h:
            return
        covered.setdefault(registrable(h), label)

    try:
        from scrapers.generic_board import BOARDS
        for b in BOARDS:
            for u in b.list_urls:
                add(u, f"generic_board:{b.name}")
    except Exception as e:
        print(f"  ! generic_board 로드 실패: {e}")

    try:
        from scrapers.official_pages import PAGES
        for p in PAGES:
            add(p.url, f"official_pages:{p.org}")
    except Exception as e:
        print(f"  ! official_pages 로드 실패: {e}")

    try:
        from scrapers.castingnara import _LIST_URL as CN
        add(CN, "scraper:캐스팅나라")
    except Exception:
        pass
    try:
        from scrapers.starlet import _LIST_URL as ST
        add(ST, "scraper:스탈렛")
    except Exception:
        pass

    try:
        from sns_sources.exclude_domains import AGGREGATORS, PORTALS
        for d in AGGREGATORS:
            add(d, "애그리게이터(저장 금지)")
        for d in PORTALS:
            add(d, "포털·SNS(별도 채널)")
    except Exception as e:
        print(f"  ! exclude_domains 로드 실패: {e}")

    return covered


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    covered = collect_covered()
    print(f"커버 도메인 {len(covered):,}개 수집\n")

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # trusted_sources 는 source_name 이라 도메인이 아닐 수 있다 — 도메인처럼 보이는 것만 취한다
    try:
        for row in sb.table("trusted_sources").select("source_name").limit(2000).execute().data:
            name = (row.get("source_name") or "").strip()
            if "." in name and " " not in name:
                covered.setdefault(registrable(host_of(name)), f"trusted_sources:{name}")
    except Exception as e:
        print(f"  ! trusted_sources 조회 실패: {e}")

    rows, off = [], 0
    while True:
        b = (sb.table("source_candidates").select("id,url,kind,hits,ai_verdict")
             .eq("status", "new").range(off, off + 999).execute().data)
        if not b:
            break
        rows += b
        off += 1000
    print(f"미처리 후보 {len(rows):,}건 검사\n")

    hits_label: list[tuple[dict, str]] = []
    for r in rows:
        # 도메인형만 판정한다. threads/instagram 계정 후보는 URL 이 플랫폼 도메인이라
        # 여기서 걸면 전부 "포털"로 잘못 잡힌다.
        if r.get("kind") != "domain":
            continue
        label = covered.get(registrable(host_of(r["url"])))
        if label:
            hits_label.append((r, label))

    print(f"=== 이미 커버 중: {len(hits_label):,}건 ===")
    for k, v in Counter(l for _, l in hits_label).most_common(20):
        print(f"  {k:34} {v:4,}")

    top = sorted(hits_label, key=lambda x: -int(x[0].get("hits") or 0))[:10]
    print("\n=== 발견 횟수 상위 중복 ===")
    for r, l in top:
        print(f"  x{str(r.get('hits')):<6} {host_of(r['url'])[:34]:34} ← {l}")

    if args.dry_run:
        print("\n--dry-run — DB 미변경")
        return

    ok = 0
    for r, label in hits_label:
        try:
            sb.table("source_candidates").update({"covered_by": label}).eq("id", r["id"]).execute()
            ok += 1
        except Exception as e:
            print(f"  실패 {r['id']}: {e}")
        if ok % 100 == 0 and ok:
            print(f"  {ok:,}/{len(hits_label):,}", flush=True)

    print(f"\n완료 — covered_by 표시 {ok:,}건. status 는 변경하지 않았습니다.")


if __name__ == "__main__":
    main()
