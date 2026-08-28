# -*- coding: utf-8 -*-
"""승인된 소스 후보를 실제 수집 대상으로 승격.

배경(2026-08-28): naver_web.py 주석은 "운영자 승인 시 화이트리스트로 승격"이라고 했지만
그 코드가 없었다. status='approved' 를 읽는 곳이 전 코드베이스에 없어, 승인해도 아무 일도
일어나지 않았다. 이 스크립트가 그 구멍을 메운다.

승격 규칙 (kind 별로 뜻이 다르다):
  blog    → trusted_sources 에 `네이버블로그:{블로그ID}` 등록. 다음 크롤부터 저장된다.
            /admin/candidates 승인 시 API 가 이미 처리하지만, 백필·재시도용으로 여기도 둔다.
  threads → sns_sources/social_accounts.json 의 threads.accounts 에 계정 추가.
            (웹 어드민은 크롤러 쪽 파일을 못 써서 이 경로가 필요하다)
  domain  → **자동화 불가.** 게시판 목록 URL·상세 링크 정규식이 사이트마다 달라
            generic_board.py / official_pages.py 에 사람이 추가해야 한다. 목록만 출력한다.

블로그 키 규칙은 naver_web.py:_blog_key 와 반드시 같아야 한다.

사용:
  python tools/promote_candidates.py --dry-run
  python tools/promote_candidates.py
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))
from supabase import create_client

ACCOUNTS_JSON = os.path.join("sns_sources", "social_accounts.json")
_BLOG_ID_RE = re.compile(r"blog\.naver\.com/([A-Za-z0-9_-]+)")
_THREADS_RE = re.compile(r"threads\.net/@?([A-Za-z0-9_.]+)")


def blog_source_name(url: str) -> str | None:
    m = _BLOG_ID_RE.search(url or "")
    return f"네이버블로그:{m.group(1)}" if m else None


def threads_account(url: str) -> str | None:
    m = _THREADS_RE.search(url or "")
    return m.group(1) if m else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    rows, off = [], 0
    while True:
        b = (sb.table("source_candidates").select("id,url,kind,hits,sample_title")
             .eq("status", "approved").range(off, off + 999).execute().data)
        if not b:
            break
        rows += b
        off += 1000
    print(f"승인된 후보 {len(rows):,}건\n")
    if not rows:
        print("승격할 것이 없습니다. /admin/candidates 에서 먼저 승인하세요.")
        return

    blogs = {n for r in rows if r["kind"] == "blog" and (n := blog_source_name(r["url"]))}
    threads = {a for r in rows if r["kind"] == "threads" and (a := threads_account(r["url"]))}
    domains = [r for r in rows if r["kind"] == "domain"]

    # ── 블로그 → trusted_sources ────────────────────────────────
    existing = set()
    try:
        for x in sb.table("trusted_sources").select("source_name").limit(5000).execute().data:
            existing.add(x["source_name"])
    except Exception as e:
        print(f"  ! trusted_sources 조회 실패: {e}")
    new_blogs = sorted(blogs - existing)
    print(f"=== 블로그: 승인 {len(blogs)}곳 / 신규 등록 대상 {len(new_blogs)}곳 ===")
    for n in new_blogs[:10]:
        print(f"  + {n}")
    if len(new_blogs) > 10:
        print(f"  … 외 {len(new_blogs) - 10}곳")

    # ── 스레드 → social_accounts.json ───────────────────────────
    cfg = json.load(open(ACCOUNTS_JSON, encoding="utf-8"))
    cur = set(cfg.get("threads", {}).get("accounts", []))
    new_threads = sorted(threads - cur)
    print(f"\n=== 스레드: 승인 {len(threads)}개 / 신규 추가 대상 {len(new_threads)}개 ===")
    for a in new_threads:
        print(f"  + @{a}")

    # ── 도메인 → 수동 ───────────────────────────────────────────
    print(f"\n=== 사이트(domain): {len(domains)}건 — 자동 승격 불가 ===")
    print("  generic_board.py 에 목록 URL + 상세 링크 정규식을 추가해야 수집됩니다.")
    for r in sorted(domains, key=lambda x: -int(x.get("hits") or 0))[:10]:
        print(f"  x{str(r.get('hits')):<6} {r['url'][:56]}")
    if len(domains) > 10:
        print(f"  … 외 {len(domains) - 10}건")

    if args.dry_run:
        print("\n--dry-run — 아무것도 변경하지 않았습니다.")
        return

    changed = False
    if new_blogs:
        try:
            sb.table("trusted_sources").upsert(
                [{"source_name": n} for n in new_blogs], on_conflict="source_name"
            ).execute()
            print(f"\n✓ trusted_sources 에 블로그 {len(new_blogs)}곳 등록")
            changed = True
        except Exception as e:
            print(f"\n! 블로그 등록 실패: {e}")

    if new_threads:
        cfg.setdefault("threads", {}).setdefault("accounts", [])
        cfg["threads"]["accounts"] = sorted(cur | set(new_threads))
        # 원본 보존 후 기록 — 되돌릴 수 있게
        bak = ACCOUNTS_JSON + ".bak"
        if not os.path.exists(bak):
            with open(bak, "w", encoding="utf-8") as f:
                json.dump(json.load(open(ACCOUNTS_JSON, encoding="utf-8")), f, ensure_ascii=False, indent=2)
        with open(ACCOUNTS_JSON, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print(f"✓ social_accounts.json 에 스레드 계정 {len(new_threads)}개 추가")
        changed = True

    if not changed:
        print("\n새로 승격할 것이 없습니다 (이미 전부 반영됨).")
    else:
        print("\n다음 크롤 실행부터 이 출처들이 수집됩니다.")


if __name__ == "__main__":
    main()
