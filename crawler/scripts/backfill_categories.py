"""
기존 auditions 전수 재분류 백필 (30 마스터플랜 2-1)

- 라이브 크롤러(origin/main)는 분류기를 안 태우므로, 누적 공고의 category 4컬럼은 이 스크립트로 채운다.
- 기본은 dry-run(분포만 출력). 실제 반영은 --apply.
- genre는 기본 보존(프론트 필터·배지에 노출되는 값). --update-genre 시 레거시 3분류로 재매핑.
- 전제: 007_category_system.sql 적용. 미적용이면 즉시 중단한다.

실행 (crawler/ 에서):
  python scripts/backfill_categories.py                 # dry-run
  python scripts/backfill_categories.py --apply         # category 4컬럼 반영
  python scripts/backfill_categories.py --apply --update-genre
  python scripts/backfill_categories.py --active-only   # is_active=true만
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # crawler/

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client  # noqa: E402

from utils.classifier import classify_audition, to_legacy_genre  # noqa: E402

CATEGORY_COLUMNS = ("category", "sub_category", "category_confidence", "classify_method")
PAGE = 1000
UPDATE_CHUNK = 200


def fetch_all(sb, active_only: bool) -> list[dict]:
    rows: list[dict] = []
    start = 0
    cols = "id,title,description,requirements,source_name,genre," + ",".join(CATEGORY_COLUMNS)
    while True:
        q = sb.table("auditions").select(cols).order("id").range(start, start + PAGE - 1)
        if active_only:
            q = q.eq("is_active", True)
        page = q.execute().data
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        start += PAGE


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 UPDATE 실행 (기본 dry-run)")
    ap.add_argument("--update-genre", action="store_true", help="genre도 레거시 3분류로 재매핑")
    ap.add_argument("--active-only", action="store_true", help="is_active=true 행만")
    args = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    try:
        sb.table("auditions").select(",".join(CATEGORY_COLUMNS)).limit(1).execute()
    except Exception as e:
        print("✗ auditions에 category 컬럼 없음 → 007_category_system.sql 먼저 적용하세요.")
        print("  확인: database/checks/007_008_status.sql")
        print(f"  ({str(e)[:120]})")
        return 2

    rows = fetch_all(sb, args.active_only)
    scope = "active만" if args.active_only else "전체"
    print(f"대상 {len(rows)}건 ({scope})")

    # (category, confidence, method, genre) 동일 행끼리 묶어 UPDATE 횟수 최소화
    groups: dict[tuple, list[str]] = defaultdict(list)
    cat_dist: Counter = Counter()
    method_dist: Counter = Counter()
    genre_change: Counter = Counter()
    changed = 0

    for r in rows:
        text = "\n".join(t for t in (r.get("description"), r.get("requirements")) if t)
        res = classify_audition(r.get("title") or "", text, r.get("source_name") or "")
        new_genre = r["genre"]
        if args.update_genre and res.category_code != "etc":
            new_genre = to_legacy_genre(res.category_code)
        if new_genre != r["genre"]:
            genre_change[(r["genre"], new_genre)] += 1

        cat_dist[res.category] += 1
        method_dist[res.method] += 1

        same = (
            r.get("category") == res.category
            and abs((r.get("category_confidence") or 0) - res.confidence) < 1e-6
            and r.get("classify_method") == res.method
            and new_genre == r["genre"]
        )
        if same:
            continue
        changed += 1
        groups[(res.category, res.confidence, res.method, new_genre)].append(r["id"])

    print("\n[카테고리 분포]")
    for cat, n in cat_dist.most_common():
        print(f"  {cat:8s} {n:5d}  ({n / max(len(rows), 1):.1%})")
    print("\n[분류 방법]", dict(method_dist))
    if genre_change:
        print("\n[genre 변경]", {f"{a}→{b}": n for (a, b), n in genre_change.items()})
    print(f"\n변경 필요 {changed}건 / UPDATE 그룹 {len(groups)}개")

    if not args.apply:
        print("\n(dry-run) 반영하려면 --apply")
        return 0

    done = 0
    for (cat, conf, method, genre), ids in groups.items():
        payload = {
            "category": cat,
            "sub_category": None,
            "category_confidence": conf,
            "classify_method": method,
            "genre": genre,
        }
        for i in range(0, len(ids), UPDATE_CHUNK):
            chunk = ids[i : i + UPDATE_CHUNK]
            sb.table("auditions").update(payload).in_("id", chunk).execute()
            done += len(chunk)
            print(f"  … {done}/{changed}", end="\r")
    print(f"\n✓ {done}건 반영 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
