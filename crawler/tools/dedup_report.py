# -*- coding: utf-8 -*-
"""크로스소스 중복 후보 리포트 (플랜 37 스프린트 1, 읽기 전용).

활성 공고 전체를 대상으로:
  - 블로킹 키: apply_email / 제목 지문(title fingerprint)
  - 점수: 이메일 일치 +45, 마감 일치 +25, 제목 유사도(rapidfuzz 없으면 difflib) ≥0.85 +20,
          카테고리 일치 +10 / 마감 상이 -30
  - 75+ = 자동 병합 후보, 50~74 = 검수 병합 후보
DB를 변경하지 않는다. 결과는 표 + JSON 리포트.

사용: python -m tools.dedup_report [--json]
"""

import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from itertools import combinations
from pathlib import Path

from utils.supabase_client import supabase as sb

_NOISE_RE = re.compile(r"\[[^\]]*\]|[★☆♥♡●◆■◇]|급구|재공고|마감\s*임박|모집\s*중|\s+")
_DATE_PREFIX_RE = re.compile(r"^\d{1,2}[./월]\s*\d{1,2}일?\s*")


def fingerprint(title: str) -> str:
    t = _DATE_PREFIX_RE.sub("", title or "")
    return _NOISE_RE.sub("", t).lower()[:60]


def similarity(a: str, b: str) -> float:
    try:
        from rapidfuzz.fuzz import ratio
        return ratio(a, b) / 100.0
    except ImportError:
        return SequenceMatcher(None, a, b).ratio()


def score_pair(a: dict, b: dict) -> int:
    s = 0
    if a["apply_email"] and a["apply_email"] == b["apply_email"]:
        s += 45
    if a["deadline"] and a["deadline"] == b["deadline"]:
        s += 25
    elif a["deadline"] and b["deadline"] and a["deadline"] != b["deadline"]:
        s -= 30
    sim = similarity(a["fp"], b["fp"])
    if sim >= 0.85:
        s += 20
    elif sim >= 0.7:
        s += 10
    if a.get("category") and a.get("category") == b.get("category"):
        s += 10
    return s


def main() -> None:
    rows: list[dict] = []
    off = 0
    while off < 10000:
        batch = (
            sb.table("auditions")
            .select("id,title,deadline,apply_email,category,source_name,source_url")
            .eq("is_active", True)
            .range(off, off + 999)
            .execute()
            .data
        )
        if not batch:
            break
        rows += batch
        off += 1000
    for r in rows:
        r["fp"] = fingerprint(r["title"])

    # 블로킹: 같은 이메일 / 같은 지문 앞 12자만 쌍 비교 (O(n^2) 방지)
    buckets: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["apply_email"]:
            buckets[f"e:{r['apply_email']}"].append(r)
        if len(r["fp"]) >= 8:
            buckets[f"t:{r['fp'][:12]}"].append(r)

    seen_pairs: set[tuple] = set()
    auto, review = [], []
    for key, group in buckets.items():
        if len(group) < 2 or len(group) > 80:
            continue
        for a, b in combinations(group, 2):
            pk = tuple(sorted((a["id"], b["id"])))
            if pk in seen_pairs:
                continue
            seen_pairs.add(pk)
            s = score_pair(a, b)
            if s >= 75:
                auto.append((s, a, b))
            elif s >= 50:
                review.append((s, a, b))

    cross = [x for x in auto + review
             if x[1]["source_name"].split(":")[0] != x[2]["source_name"].split(":")[0]]

    print(f"활성 {len(rows)}건 스캔 — 자동 병합 후보 {len(auto)}쌍 · 검수 병합 후보 {len(review)}쌍 "
          f"(크로스 소스 {len(cross)}쌍)")
    print()
    for label, items in (("자동 병합(75+)", auto[:15]), ("검수 병합(50~74)", review[:10])):
        if not items:
            continue
        print(f"── {label} 상위 ──")
        for s, a, b in sorted(items, key=lambda x: -x[0])[:15]:
            print(f"  [{s:3d}] {a['title'][:34]}")
            print(f"        {a['source_name'][:24]} ↔ {b['source_name'][:24]} | 마감 {a['deadline']}/{b['deadline']}")
        print()

    if "--json" in sys.argv:
        out = Path(__file__).resolve().parent.parent / "logs" / f"dedup_report_{datetime.now():%Y%m%d_%H%M}.json"
        out.write_text(json.dumps({
            "scanned": len(rows),
            "auto": [{"score": s, "a": a["id"], "b": b["id"],
                      "a_title": a["title"], "b_title": b["title"],
                      "a_src": a["source_name"], "b_src": b["source_name"]} for s, a, b in auto],
            "review": [{"score": s, "a": a["id"], "b": b["id"],
                        "a_title": a["title"], "b_title": b["title"]} for s, a, b in review],
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"리포트 저장: {out}")


if __name__ == "__main__":
    main()
