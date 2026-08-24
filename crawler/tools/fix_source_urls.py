# -*- coding: utf-8 -*-
"""필메코 source_url 이스케이프(\\/) 복구 — 일회성 데이터 정정 (2026-08-24).

원인: filmmakers.py가 onclick 속성의 JSON 이스케이프된 URL(https:\\/\\/…)을
그대로 저장 (스크레이퍼는 같은 날 수정됨). 이 스크립트는 기존 레코드의
source_url에서 '\\/'를 '/'로 치환한다. 멱등 — 재실행해도 안전.

사용:
    python -m tools.fix_source_urls            # dry-run (건수·샘플만 출력)
    python -m tools.fix_source_urls --apply    # 실제 반영
"""
import sys

from utils.supabase_client import supabase


def find_bad():
    bad, off = [], []
    offset = 0
    while True:
        rows = (
            supabase.table("auditions")
            .select("id,source_url")
            .range(offset, offset + 999)
            .execute()
            .data
        )
        if not rows:
            break
        bad += [r for r in rows if "\\" in (r["source_url"] or "")]
        offset += 1000
    return bad


def main():
    apply = "--apply" in sys.argv
    bad = find_bad()
    print(f"이스케이프된 source_url: {len(bad)}건")
    for r in bad[:3]:
        print("  예:", r["source_url"])
    if not apply:
        print("dry-run — 반영하려면 --apply")
        return
    fixed = 0
    for r in bad:
        clean = r["source_url"].replace("\\/", "/")
        supabase.table("auditions").update({"source_url": clean}).eq("id", r["id"]).execute()
        fixed += 1
        if fixed % 200 == 0:
            print(f"  ... {fixed}/{len(bad)}")
    print(f"정정 완료: {fixed}건")


if __name__ == "__main__":
    main()
