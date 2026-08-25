# -*- coding: utf-8 -*-
"""활성 공고 위험 정리 스윕 (플랜 37 auto-triage 소급 적용, 일회성+주기 실행 가능).

격리(비활성 + review_status='quarantine') 대상 — 보수적 기준만:
  1. 출처 카페명에 '누드' 포함 (성인 컨셉 카페 — 서비스 대상 외, 카페 블랙리스트에도 추가됨)
  2. 미성년 신호(아역·키즈·유아·청소년) + 위험 신호(신분증·성인·징수) 조합 — 36 §4 정책
  3. risk_score ≥ 7

사용:
    python -m tools.quarantine_sweep            # dry-run
    python -m tools.quarantine_sweep --apply    # 반영
"""

import re
import sys

from utils.risk import risk_score
from utils.supabase_client import supabase as sb

_MINOR = re.compile(r"아역|키즈|유아|아기|어린이|청소년|초등|중학생|고등학생|\b남아\b|\b여아\b")
_MINOR_DANGER = {"신분증·금융정보 요구", "성인·노출", "비용 징수 문맥"}


def main() -> None:
    apply = "--apply" in sys.argv
    rows = []
    off = 0
    while off < 10000:
        b = (sb.table("auditions")
             .select("id,title,description,source_name")
             .eq("is_active", True).range(off, off + 999).execute().data)
        if not b:
            break
        rows += b
        off += 1000

    targets = []
    for r in rows:
        reason = None
        if "누드" in (r["source_name"] or ""):
            reason = "성인 컨셉 카페 출처"
        else:
            s, why = risk_score(r["title"], r["description"])
            if s >= 7:
                reason = f"위험 {s}: {', '.join(why)}"
            elif _MINOR.search(f"{r['title']} {r['description'] or ''}") and _MINOR_DANGER & set(why):
                reason = f"미성년+위험 조합: {', '.join(_MINOR_DANGER & set(why))}"
        if reason:
            targets.append((r, reason))

    print(f"활성 {len(rows)}건 중 격리 대상 {len(targets)}건")
    for r, reason in targets:
        print(f"  - {r['title'][:44]} | {r['source_name'][:22]} | {reason}")

    if not apply:
        print("\ndry-run — 반영하려면 --apply")
        return
    n = 0
    for r, _ in targets:
        sb.table("auditions").update(
            {"is_active": False, "review_status": "quarantine"}
        ).eq("id", r["id"]).execute()
        n += 1
    print(f"\n격리 반영: {n}건")


if __name__ == "__main__":
    main()
