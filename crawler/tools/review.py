"""
검수 큐 CLI (플랜 E-2). crawler/ 에서 실행.

  python -m tools.review list [--limit 40] [--source 네이버카페]   pending 표 (번호·점수·카테고리·출처·제목·링크)
  python -m tools.review approve 1 3 5          번호로 승인 → approved + 활성
  python -m tools.review reject 2 4              거절 → rejected + 비활성
  python -m tools.review approve-source "네이버카페:연뮤덕"   해당 출처 pending 전부 승인 + trusted_sources 등록
  python -m tools.review trust "네이버카페:연뮤덕" [--note ...] 출처를 자동 게재 화이트리스트에 등록만
  python -m tools.review untrust "네이버카페:xxx"
  python -m tools.review candidates [--kind instagram]  발견 큐(source_candidates) 표
  python -m tools.review candidate-approve 3 7 / candidate-reject 2

번호는 직전 `list`/`candidates` 출력 순서(로컬 캐시 .review_cache.json)에 대응한다 — 채팅에서 "1,3 승인"을 그대로 반영하기 위함.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
from supabase import create_client  # noqa: E402

CACHE = Path(__file__).resolve().parent.parent / ".review_cache.json"
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def _save_cache(kind: str, ids: list[str]) -> None:
    CACHE.write_text(json.dumps({"kind": kind, "ids": ids}, ensure_ascii=False), encoding="utf-8")


def _load_cache(kind: str) -> list[str]:
    if not CACHE.exists():
        sys.exit("먼저 list/candidates 를 실행해 번호를 만드세요.")
    c = json.loads(CACHE.read_text(encoding="utf-8"))
    if c.get("kind") != kind:
        sys.exit(f"직전 목록이 {c.get('kind')}입니다. {kind}를 다시 출력하세요.")
    return c["ids"]


def _ids_from_numbers(kind: str, nums: list[int]) -> list[str]:
    ids = _load_cache(kind)
    out = []
    for n in nums:
        if 1 <= n <= len(ids):
            out.append(ids[n - 1])
        else:
            print(f"  번호 {n} 범위 밖(1~{len(ids)})")
    return out


def cmd_list(args) -> None:
    q = (
        sb.table("auditions")
        .select("id,title,source_name,quality_score,category,deadline,apply_email,source_url,created_at")
        .eq("review_status", "pending").order("created_at", desc=True).limit(args.limit)
    )
    if args.source:
        q = q.like("source_name", f"{args.source}%")
    rows = q.execute().data or []
    total = sb.table("auditions").select("id", count="exact").eq("review_status", "pending").execute().count
    print(f"pending {total}건 (표시 {len(rows)})\n")
    print(f"{'#':>3} {'점수':>4} {'카테고리':6s} {'마감':10s} {'출처':22s} 제목 | 링크")
    for i, r in enumerate(rows, 1):
        em = "✉" if r.get("apply_email") else " "
        print(f"{i:3d} {r.get('quality_score') or 0:4.2f} {str(r.get('category') or '-'):6s} {str(r.get('deadline') or '-'):10s} "
              f"{(r.get('source_name') or '')[:22]:22s} {em}{(r.get('title') or '')[:48]} | {r.get('source_url')}")
    _save_cache("auditions", [r["id"] for r in rows])


def _set_status(ids: list[str], status: str) -> None:
    if not ids:
        return
    active = status == "approved"
    sb.table("auditions").update({"review_status": status, "is_active": active}).in_("id", ids).execute()
    print(f"✓ {len(ids)}건 → {status}")


def cmd_approve(args) -> None:
    _set_status(_ids_from_numbers("auditions", args.nums), "approved")


def cmd_reject(args) -> None:
    _set_status(_ids_from_numbers("auditions", args.nums), "rejected")


def cmd_trust(args) -> None:
    sb.table("trusted_sources").upsert({"source_name": args.source, "note": args.note or "review.py"}).execute()
    print(f"✓ trusted: {args.source}")


def cmd_untrust(args) -> None:
    sb.table("trusted_sources").delete().eq("source_name", args.source).execute()
    print(f"✓ untrusted: {args.source}")


def cmd_approve_source(args) -> None:
    res = sb.table("auditions").update({"review_status": "approved", "is_active": True}).eq(
        "review_status", "pending").eq("source_name", args.source).execute()
    print(f"✓ {len(res.data or [])}건 승인 ({args.source})")
    cmd_trust(args)


def cmd_candidates(args) -> None:
    q = sb.table("source_candidates").select("id,url,kind,found_by,hits,sample_title,status").eq("status", "new").order("hits", desc=True).limit(args.limit)
    if args.kind:
        q = q.eq("kind", args.kind)
    rows = q.execute().data or []
    print(f"발견 큐 new {len(rows)}건\n")
    for i, r in enumerate(rows, 1):
        print(f"{i:3d} [{r['kind']:10s}] x{r['hits']:<3d} {r['url'][:60]:60s} ← {r.get('found_by','')[:24]} | {(r.get('sample_title') or '')[:40]}")
    _save_cache("candidates", [r["id"] for r in rows])


def _cand_status(nums: list[int], status: str) -> None:
    ids = _ids_from_numbers("candidates", nums)
    if ids:
        sb.table("source_candidates").update({"status": status, "last_seen": datetime.now(timezone.utc).isoformat()}).in_("id", ids).execute()
        print(f"✓ 후보 {len(ids)}건 → {status}")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list"); p.add_argument("--limit", type=int, default=40); p.add_argument("--source"); p.set_defaults(f=cmd_list)
    p = sub.add_parser("approve"); p.add_argument("nums", type=int, nargs="+"); p.set_defaults(f=cmd_approve)
    p = sub.add_parser("reject"); p.add_argument("nums", type=int, nargs="+"); p.set_defaults(f=cmd_reject)
    p = sub.add_parser("trust"); p.add_argument("source"); p.add_argument("--note"); p.set_defaults(f=cmd_trust)
    p = sub.add_parser("untrust"); p.add_argument("source"); p.set_defaults(f=cmd_untrust)
    p = sub.add_parser("approve-source"); p.add_argument("source"); p.add_argument("--note"); p.set_defaults(f=cmd_approve_source)
    p = sub.add_parser("candidates"); p.add_argument("--limit", type=int, default=40); p.add_argument("--kind"); p.set_defaults(f=cmd_candidates)
    p = sub.add_parser("candidate-approve"); p.add_argument("nums", type=int, nargs="+"); p.set_defaults(f=lambda a: _cand_status(a.nums, "approved"))
    p = sub.add_parser("candidate-reject"); p.add_argument("nums", type=int, nargs="+"); p.set_defaults(f=lambda a: _cand_status(a.nums, "rejected"))
    args = ap.parse_args()
    args.f(args)


if __name__ == "__main__":
    main()
