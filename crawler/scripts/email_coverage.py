"""apply_email 보유율 지표 + 오발송 감사 (30 마스터플랜 2-2 · D4)

두 가지를 한 번에 본다.
1. **보유율**: 소스별 활성 공고 중 apply_email 보유 비율 — 원클릭 지원이 되는 공고의 비율.
   낮은 소스는 external(링크 유도) 공고만 쌓이고 있다는 뜻.
2. **감사**: 이미 저장된 apply_email 중 `utils.email_extract` 정본 규칙에 걸리는 건
   — 사이트 자체 메일·운영성 계정이 접수처로 저장된 것들. **오발송 위험 실측치**다.

기본은 읽기 전용. `--fix`를 줘야 위반 건의 apply_email을 지운다(행은 남기고 external로 강등).

실행 (crawler/ 에서):
  python scripts/email_coverage.py                # 보유율 + 감사 (활성 공고)
  python scripts/email_coverage.py --all          # 비활성 포함
  python scripts/email_coverage.py --list 30      # 위반 사례 30건 출력
  python scripts/email_coverage.py --fix          # 위반 건 apply_email 제거 (되돌릴 수 없음)
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # crawler/

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client  # noqa: E402

from utils.email_extract import is_apply_email  # noqa: E402

PAGE = 1000
UPDATE_CHUNK = 100


def fetch_all(sb, active_only: bool) -> list[dict]:
    """PostgREST 응답 1000행 상한 — 전수 집계는 range 페이지네이션 필수(39 불변식 ⑥)."""
    rows: list[dict] = []
    start = 0
    cols = "id,title,source_name,source_url,apply_email,is_active"
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
    ap.add_argument("--all", action="store_true", help="비활성 공고까지 포함")
    ap.add_argument("--list", type=int, default=10, metavar="N", help="위반 사례 N건 출력 (기본 10)")
    ap.add_argument("--fix", action="store_true", help="위반 건의 apply_email 제거 (기본 읽기 전용)")
    args = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows = fetch_all(sb, active_only=not args.all)
    scope = "전체(비활성 포함)" if args.all else "활성"
    print(f"대상 {len(rows)}건 ({scope})\n")

    stats: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "email": 0, "bad": 0})
    bad_rows: list[dict] = []

    for r in rows:
        src = r.get("source_name") or "(없음)"
        s = stats[src]
        s["n"] += 1
        email = (r.get("apply_email") or "").strip()
        if not email:
            continue
        s["email"] += 1
        # 소스 URL을 넘겨 "그 사이트 자체 메일"까지 잡는다
        if not is_apply_email(email, source=r.get("source_url") or ""):
            s["bad"] += 1
            bad_rows.append(r)

    print(f"{'소스':<26}{'공고':>7}{'이메일':>8}{'보유율':>8}{'위반':>7}")
    print("-" * 56)
    for src, s in sorted(stats.items(), key=lambda kv: -kv[1]["n"]):
        rate = s["email"] / s["n"] * 100 if s["n"] else 0
        print(f"{src[:25]:<26}{s['n']:>7}{s['email']:>8}{rate:>7.1f}%{s['bad']:>7}")

    total = len(rows)
    have = sum(s["email"] for s in stats.values())
    bad = len(bad_rows)
    print("-" * 56)
    print(f"{'합계':<26}{total:>7}{have:>8}{(have / total * 100 if total else 0):>7.1f}%{bad:>7}")

    if bad_rows:
        print(f"\n⚠ 접수처로 부적합한 apply_email {bad}건 — 유저 지원 메일이 엉뚱한 곳으로 간다.")
        for r in bad_rows[:args.list]:
            print(f"  #{r['id']} [{r.get('source_name')}] {r.get('apply_email')} | {(r.get('title') or '')[:40]}")
        if len(bad_rows) > args.list:
            print(f"  … 외 {len(bad_rows) - args.list}건 (--list N 으로 더 보기)")

    if not args.fix:
        if bad_rows:
            print("\n읽기 전용으로 끝냈다. 실제 제거는 --fix.")
        return 0

    if not bad_rows:
        print("\n제거할 건 없음.")
        return 0

    ids = [r["id"] for r in bad_rows]
    done = 0
    for i in range(0, len(ids), UPDATE_CHUNK):
        chunk = ids[i:i + UPDATE_CHUNK]
        sb.table("auditions").update({"apply_email": None, "apply_type": "external"}).in_("id", chunk).execute()
        done += len(chunk)
        print(f"  제거 {done}/{len(ids)}")
    print(f"\n✓ {done}건의 apply_email 제거 완료 (apply_type=external로 강등).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
