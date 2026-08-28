# -*- coding: utf-8 -*-
"""필메코 등 애그리게이터 공고의 '원 출처 역추적' 커버율 실측 (2026-08-28).

배경: 필름메이커스는 구인자 이메일을 **로그인 + '연락처 보기' 클릭** 뒤에 숨긴다.
익명 크롤로는 못 얻어서 필메코 1,641건 중 apply_email 은 298건(18%)뿐이다.
로그인 자동화는 DB제작자 권리(잡코리아 v 사람인) 리스크가 있어, 먼저 위험 0인 경로를
재본다: **같은 공고를 올린 블로그·카페 원글을 찾아 거기서 이메일을 얻는다.**

이 스크립트는 DB를 바꾸지 않는다. "몇 %를 위험 없이 커버할 수 있는가"만 측정한다.

사용: python tools/measure_backtrace.py --limit 40
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))

from supabase import create_client

from sns_sources.backtrace import Lead, find_original
from sns_sources.exclude_domains import domain_of
from utils.email_extract import extract_apply_email


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--source", default="필메코")
    ap.add_argument("--out", default="logs/backtrace_measure.jsonl")
    args = ap.parse_args()

    cid = os.environ.get("NAVER_API_HUB_CLIENT_ID")
    csec = os.environ.get("NAVER_API_HUB_CLIENT_SECRET")
    if not (cid and csec):
        sys.exit("NAVER_API_HUB_CLIENT_ID/SECRET 없음 — crawler/.env 확인")

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows = (sb.table("auditions")
            .select("id,title,source_url,created_at")
            .eq("source_name", args.source)
            .is_("apply_email", "null")
            .eq("is_active", True)
            .order("created_at", desc=True)
            .limit(args.limit).execute().data)
    print(f"대상: {args.source} · apply_email 없는 활성 공고 {len(rows)}건\n")

    os.makedirs("logs", exist_ok=True)
    found_orig = found_mail = 0
    domains: Counter[str] = Counter()
    t0 = time.time()

    with open(args.out, "w", encoding="utf-8") as f:
        for i, r in enumerate(rows, 1):
            lead = Lead(aggregator=args.source, title=r["title"] or "")
            orig = None
            try:
                orig = find_original(lead, cid, csec)
            except Exception as e:
                print(f"  ! {str(e)[:60]}")
            email = None
            if orig:
                found_orig += 1
                domains[domain_of(orig.link)] += 1
                # 검색 결과 요약(description)에서 먼저 시도 — 본문 요청 없이 얻히면 가장 싸다
                email = extract_apply_email(orig.description or "")
                if email:
                    found_mail += 1
            f.write(json.dumps({
                "id": r["id"], "title": r["title"],
                "filmmakers_url": r["source_url"],
                "original": orig.link if orig else None,
                "original_title": orig.title if orig else None,
                "email": email,
            }, ensure_ascii=False) + "\n")
            if i % 10 == 0 or i == len(rows):
                print(f"  {i}/{len(rows)}  원글 {found_orig}  이메일 {found_mail}  {time.time()-t0:.0f}s", flush=True)
            time.sleep(0.3)

    n = max(len(rows), 1)
    print(f"\n=== 실측 결과 ({args.source}) ===")
    print(f"  원글 발견     : {found_orig}/{len(rows)} ({found_orig/n*100:.0f}%)")
    print(f"  이메일까지 확보: {found_mail}/{len(rows)} ({found_mail/n*100:.0f}%)")
    if domains:
        print("\n  원글 도메인:")
        for d, c in domains.most_common(10):
            print(f"    {d:34} {c}")
    print(f"\n  상세: {args.out}")
    print("  ※ 요약문에서만 뽑은 값이다. 원글 본문까지 열면 이메일 확보율은 더 오른다.")


if __name__ == "__main__":
    main()
