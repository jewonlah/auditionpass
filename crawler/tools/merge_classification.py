# -*- coding: utf-8 -*-
"""두 번의 분류 결과를 합의(consensus)로 병합 — 일치할 때만 판정을 신뢰한다.

배경(2026-08-28): 프롬프트를 고쳐 재분류했더니 434건 중 164건(38%)의 판정이 뒤집혔다.
학원·일반채용을 걸러낸 건 개선이지만, reject→approve 29건처럼 반대 방향 변동도 같은 규모라
"상당수는 모델이 확신 없이 찍은 것"이라는 신호다. 한쪽 결과만 믿을 근거가 없다.

규칙:
  두 판정이 같으면      → 그 판정을 쓴다
  하나라도 reject 이면  → reject (보수적. 놓치는 것보다 잘못 들이는 게 비싸다)
  그 외 불일치          → review (사람이 본다)

reject 우선인 이유: 잘못 승인하면 학원 광고·일반 채용이 오디션 목록에 섞여 신뢰가 깎이고,
사용자가 발견해서 신고할 때까지 남는다. 잘못 거부하면 발견 큐에 남아 나중에 되살리면 된다.
비대칭이 명확하므로 보수적으로 간다.

사용: python tools/merge_classification.py --a logs/candidates_classified.jsonl --b logs/reclassify_v2.jsonl
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


def load(path: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for line in open(path, encoding="utf-8"):
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        if d.get("verdict") not in VALID:
            d["verdict"] = "review"  # 스키마 밖 값(예: 'accept')은 사람 판단으로
        out[d["id"]] = d
    return out


def merge(a: dict | None, b: dict | None) -> tuple[str, str, str | None, str | None]:
    """returns (verdict, reason, source_type, risk)"""
    if a is None or b is None:
        d = a or b or {}
        return "review", "분류 1회만 수행 — 확인 필요", d.get("source_type"), d.get("risk")
    va, vb = a["verdict"], b["verdict"]
    if va == vb:
        # 근거는 나중 판정(개선된 프롬프트) 것을 쓴다
        return va, b.get("reason") or a.get("reason") or "", b.get("source_type"), b.get("risk")
    if "reject" in (va, vb):
        loser = b if vb == "reject" else a
        return "reject", f"판정 불일치({va}/{vb}) — 보수적으로 제외: {loser.get('reason') or ''}"[:200], \
            b.get("source_type") or a.get("source_type"), b.get("risk") or a.get("risk")
    return "review", f"판정 불일치({va}/{vb}) — 사람 확인 필요", \
        b.get("source_type") or a.get("source_type"), b.get("risk") or a.get("risk")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", default="logs/candidates_classified.jsonl")
    ap.add_argument("--b", default="logs/reclassify_v2.jsonl")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    A, B = load(args.a), load(args.b)
    ids = set(A) | set(B)
    print(f"1차 {len(A):,}건 / 2차 {len(B):,}건 / 합집합 {len(ids):,}건\n")

    merged = {i: merge(A.get(i), B.get(i)) for i in ids}
    print("=== 합의 결과 ===")
    for k, v in Counter(m[0] for m in merged.values()).most_common():
        print(f"  {k:9} {v:5,}")

    both = [i for i in ids if i in A and i in B]
    agree = sum(1 for i in both if A[i]["verdict"] == B[i]["verdict"])
    print(f"\n  두 번 다 분류된 {len(both):,}건 중 일치 {agree:,}건 ({agree/max(len(both),1)*100:.0f}%)")

    if args.dry_run:
        print("\n--dry-run — DB 미변경")
        return

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    now = datetime.now(timezone.utc).isoformat()
    ok = fail = 0
    items = list(merged.items())
    for n, (cid, (verdict, reason, stype, risk)) in enumerate(items, 1):
        try:
            sb.table("source_candidates").update({
                "ai_verdict": verdict,
                "ai_reason": reason,
                "ai_source_type": stype,
                "ai_risk": risk,
                "ai_classified_at": now,
            }).eq("id", cid).eq("status", "new").execute()   # 이미 처리된 건은 건드리지 않는다
            ok += 1
        except Exception as e:
            fail += 1
            if fail <= 3:
                print(f"  실패 {cid}: {e}")
        if n % 100 == 0:
            print(f"  {n:,}/{len(items):,}", flush=True)

    print(f"\n완료 — 반영 {ok:,} / 실패 {fail:,}. status 는 변경하지 않았습니다.")


if __name__ == "__main__":
    main()
