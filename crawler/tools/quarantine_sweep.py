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
from utils.supabase_client import QUARANTINE_STATUS, risk_text, supabase as sb

_MINOR = re.compile(r"아역|키즈|유아|아기|어린이|청소년|초등|중학생|고등학생|\b남아\b|\b여아\b")
_MINOR_DANGER = {"신분증·금융정보 요구", "성인·노출", "비용 징수 문맥"}

# 위험 판정은 요약본이 아니라 원문(021 description_raw)과 requirements까지 봐야 한다
# (2026-09-02 검수: 요약에서 "참가비" 줄이 빠지면 게이트를 통과했다).
# 021 미적용 라이브에서는 description_raw select가 실패하므로 그 컬럼만 빼고 폴백한다.
_SELECT_WITH_RAW = "id,title,description,description_raw,requirements,source_name"
_SELECT_LEGACY = "id,title,description,requirements,source_name"


def _fetch_page(select: str, off: int) -> list[dict]:
    return (sb.table("auditions").select(select)
            .eq("is_active", True).order("id").range(off, off + 999).execute().data)


def main() -> None:
    apply = "--apply" in sys.argv
    rows = []
    off = 0
    select = _SELECT_WITH_RAW
    while off < 10000:
        try:
            b = _fetch_page(select, off)
        except Exception as e:  # 021 미적용: description_raw 컬럼 부재
            if select == _SELECT_WITH_RAW and "description_raw" in str(e):
                print("description_raw 컬럼 없음(021 미적용) — 요약본 기준으로 판정합니다")
                select = _SELECT_LEGACY
                continue
            raise
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
            text = risk_text(r.get("description_raw"), r.get("description"), r.get("requirements"))
            s, why = risk_score(r["title"], text)
            if s >= 7:
                reason = f"위험 {s}: {', '.join(why)}"
            elif _MINOR.search(f"{r['title']} {text or ''}") and _MINOR_DANGER & set(why):
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
            {"is_active": False, "review_status": QUARANTINE_STATUS}
        ).eq("id", r["id"]).execute()
        n += 1
    print(f"\n격리 반영: {n}건")


if __name__ == "__main__":
    main()
