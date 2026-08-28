# -*- coding: utf-8 -*-
"""classify_candidates.py 결과(JSONL) → source_candidates.ai_* 컬럼 적재.

선행: database/migrations/020_candidate_triage.sql 적용.
**status 는 건드리지 않는다.** AI 판정은 제안일 뿐이고, 승인/거부는 /admin/candidates 에서
사람이 한다. 이 스크립트는 어드민 화면이 판정을 보여줄 수 있게 옮겨 담기만 한다.

사용: python tools/import_classification.py [--in logs/candidates_classified.jsonl] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))
from supabase import create_client

VALID = {"approve", "reject", "review"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default="logs/candidates_classified.jsonl")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.src):
        sys.exit(f"파일 없음: {args.src}")

    rows = []
    bad = 0
    with open(args.src, encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                bad += 1
                continue
            v = d.get("verdict")
            if v not in VALID:
                # 분류 실패건은 사람이 보도록 review 로 떨어뜨린다
                v = "review"
            rows.append(
                {
                    "id": d["id"],
                    "verdict": v,
                    "source_type": (d.get("source_type") or None),
                    "reason": (d.get("reason") or None),
                    "risk": (d.get("risk") or None),
                }
            )

    print(f"읽음 {len(rows):,}건 (깨진 줄 {bad})")
    print("판정 분포:", dict(Counter(r["verdict"] for r in rows)))
    if args.dry_run:
        print("\n--dry-run — DB 미변경")
        return

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    now = datetime.now(timezone.utc).isoformat()
    ok = fail = 0
    for i, r in enumerate(rows, 1):
        try:
            sb.table("source_candidates").update(
                {
                    "ai_verdict": r["verdict"],
                    "ai_source_type": r["source_type"],
                    "ai_reason": r["reason"],
                    "ai_risk": r["risk"],
                    "ai_classified_at": now,
                }
            ).eq("id", r["id"]).execute()
            ok += 1
        except Exception as e:
            fail += 1
            if fail <= 3:
                print(f"  실패 {r['id']}: {type(e).__name__}: {e}")
        if i % 100 == 0:
            print(f"  {i:,}/{len(rows):,}", flush=True)

    print(f"\n완료 — 반영 {ok:,} / 실패 {fail:,}")
    print("status 는 변경하지 않았습니다. 승인·거부는 /admin/candidates 에서 하세요.")


if __name__ == "__main__":
    main()
