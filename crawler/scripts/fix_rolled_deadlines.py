"""연도 보정으로 1년 밀린 마감일 되돌리기 (30 마스터플랜 2-3)

네이버 카페·웹문서 검색 API는 게시일을 주지 않아 크롤 당일을 게시일로 넘겼는데,
검색은 과거 글도 잡아온다. 그래서 `mm < 게시월 → 내년` 보정이 걸리면
**올해 6월에 올라온 마감 지난 글이 내년 6월 마감**으로 저장됐다.
추출기 쪽은 2026-08-27 커밋에서 고쳤고(`posted_at_exact=False`), 이 스크립트는 누적분용이다.

판정(셋 다 만족할 때만 정정 — 애매하면 손대지 않는다):
1. 저장된 마감이 오늘 + 180일보다 뒤 (오디션 마감이 반년 넘게 남는 경우는 드물다)
2. 본문에 **연도가 붙은 완전한 날짜가 없다** (있으면 그 연도를 믿어야 한다)
3. 본문에 저장된 마감과 같은 M/D가 있다 (= 연도만 밀렸다는 지문)

정정하면 1년을 당긴다. 그 결과는 대개 과거이고, 만료 처리는 `deactivate_expired`에 맡긴다.

실행 (crawler/ 에서):
  python scripts/fix_rolled_deadlines.py            # dry-run
  python scripts/fix_rolled_deadlines.py --apply
  python scripts/fix_rolled_deadlines.py --apply --deactivate   # 정정 후 만료분 비활성화까지
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # crawler/

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client  # noqa: E402

PAGE = 1000
UPDATE_CHUNK = 100
HORIZON_DAYS = 180
_DATE_FULL = re.compile(r"\d{4}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}")


def all_active(sb) -> list[dict]:
    out: list[dict] = []
    start = 0
    cols = "id,source_name,title,description,deadline"
    while True:
        page = (sb.table("auditions").select(cols).eq("is_active", True)
                .order("id").range(start, start + PAGE - 1).execute().data)
        out.extend(page)
        if len(page) < PAGE:
            return out
        start += PAGE


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 UPDATE 실행 (기본 dry-run)")
    ap.add_argument("--deactivate", action="store_true",
                    help="정정 결과가 과거인 건을 is_active=false로 (기본은 deactivate_expired에 맡김)")
    ap.add_argument("--list", type=int, default=8, metavar="N")
    args = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows = all_active(sb)
    today = date.today()
    horizon = today + timedelta(days=HORIZON_DAYS)

    targets: list[tuple[dict, date]] = []
    held = 0
    for r in rows:
        raw = r.get("deadline")
        if not raw:
            continue
        dl = date.fromisoformat(raw)
        if dl <= horizon:
            continue
        text = f"{r.get('title') or ''}\n{r.get('description') or ''}"
        if _DATE_FULL.search(text):
            held += 1
            continue  # 본문에 연도가 명시돼 있으면 보정 오류가 아니다
        if not re.search(rf"{dl.month}\s*[.\-/월]\s*{dl.day}\b", text):
            held += 1
            continue  # 같은 M/D가 본문에 없으면 근거 부족
        targets.append((r, dl.replace(year=dl.year - 1)))

    print(f"활성 {len(rows)}건 / 반년 초과 미래 마감 중 정정 대상 {len(targets)}건 (보류 {held}건)")
    if not targets:
        return 0
    expired = sum(1 for _, new in targets if new < today)
    print(f"  정정하면 이미 지난 마감이 되는 건: {expired}건")
    for r, new in targets[:args.list]:
        print(f"  {r['deadline']} → {new} | {r['source_name'][:18]} | {(r['title'] or '')[:42]}")
    if len(targets) > args.list:
        print(f"  … 외 {len(targets) - args.list}건")

    if not args.apply:
        print("\ndry-run. 실제 반영은 --apply.")
        return 0

    by_date: dict[str, list[str]] = {}
    for r, new in targets:
        by_date.setdefault(new.isoformat(), []).append(r["id"])
    for new_date, ids in by_date.items():
        for i in range(0, len(ids), UPDATE_CHUNK):
            sb.table("auditions").update({"deadline": new_date}).in_("id", ids[i:i + UPDATE_CHUNK]).execute()
    print(f"\n✓ {len(targets)}건 마감일 정정 완료 ({len(by_date)}개 날짜 그룹).")

    if args.deactivate:
        ids = [r["id"] for r, new in targets if new < today]
        for i in range(0, len(ids), UPDATE_CHUNK):
            sb.table("auditions").update({"is_active": False}).in_("id", ids[i:i + UPDATE_CHUNK]).execute()
        print(f"✓ 마감 지난 {len(ids)}건 비활성화.")
    else:
        print("  만료 처리는 deactivate_expired(크롤러/pg_cron)에 맡긴다. 즉시 내리려면 --deactivate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
