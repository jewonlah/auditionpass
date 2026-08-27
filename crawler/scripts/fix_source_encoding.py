"""손상된 source_name 정정 (30 마스터플랜 2-3)

cp949→UTF-8 변환 실패로 `캐스팅나��`(U+FFFD)처럼 저장된 source_name을 정상 이름으로 되돌린다.
스크레이퍼 쪽 상수는 2026-08-27 커밋에서 이미 수복했고, 이 스크립트는 **누적된 DB 레코드**용이다.

왜 중요한가: `source_name`은 단순 표시값이 아니라 **신뢰 출처 판정 키**이자 **소스 이력 키**다.
`trusted_sources`에 손상된 이름으로 등록돼 있으면 새로 수집한 공고가 신뢰 출처에서 탈락해
검수 큐 SAFE 판정이 안 되고, `crawl_logs`가 갈라져 있으면 소스 사망 판정(2-4)이 정상 이름 쪽을
"이력 없음"으로 본다. 그래서 세 테이블을 함께 고친다.

정정 규칙: U+FFFD를 지운 문자열이 알려진 소스명의 접두이고 후보가 **유일할 때만** 바꾼다.
애매하면 건드리지 않는다(잘못 합치면 서로 다른 출처가 한 이름으로 섞인다).

실행 (crawler/ 에서):
  python scripts/fix_source_encoding.py            # dry-run
  python scripts/fix_source_encoding.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # crawler/

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client  # noqa: E402

REPLACEMENT = "�"
PAGE = 1000
UPDATE_CHUNK = 100

# 알려진 소스명 — scrapers/sns_sources의 source_name 상수와 같은 값
KNOWN_SOURCES = [
    "캐스팅나라", "캐스팅114", "캐스틱", "캐스트링크", "필메코", "플필",
    "메가폰코리아", "V오디션", "OTR", "스타렛스튜디오", "공식페이지", "네이버카페",
    "네이버웹문서", "인스타그램", "스레드", "역추적", "인테이크",
]


def resolve(broken: str) -> str | None:
    """손상 이름 → 정상 이름. 유일하게 결정될 때만 반환."""
    stem = broken.replace(REPLACEMENT, "").strip()
    if not stem:
        return None
    # 접두 매칭 (`네이버카페:xxx`처럼 접미가 붙는 이름도 있으므로 앞부분으로 본다)
    head = stem.split(":")[0]
    suffix = stem[len(head):]
    cands = [k for k in KNOWN_SOURCES if k.startswith(head) or head.startswith(k)]
    if len(cands) != 1:
        return None
    return cands[0] + suffix


def all_rows(sb, table: str, cols: str) -> list[dict]:
    out: list[dict] = []
    start = 0
    while True:
        page = sb.table(table).select(cols).range(start, start + PAGE - 1).execute().data
        out.extend(page)
        if len(page) < PAGE:
            return out
        start += PAGE


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 UPDATE 실행 (기본 dry-run)")
    args = ap.parse_args()

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # 1) 손상 이름 수집
    auds = all_rows(sb, "auditions", "id,source_name")
    trusted = all_rows(sb, "trusted_sources", "source_name")
    try:
        logs = all_rows(sb, "crawl_logs", "id,source_name")
    except Exception:
        logs = []
    broken = Counter(r["source_name"] for r in auds if REPLACEMENT in (r.get("source_name") or ""))
    broken_trusted = [r["source_name"] for r in trusted if REPLACEMENT in (r.get("source_name") or "")]
    broken_logs = Counter(r["source_name"] for r in logs if REPLACEMENT in (r.get("source_name") or ""))

    plan: dict[str, str] = {}
    for name in set(broken) | set(broken_trusted) | set(broken_logs):
        fixed = resolve(name)
        if fixed:
            plan[name] = fixed
        else:
            print(f"  ? {name!r} → 후보가 유일하지 않아 건너뜀")

    if not plan:
        print("정정할 손상 source_name 없음.")
        return 0

    print(f"auditions {len(auds)}행 / trusted_sources {len(trusted)}행 검사")
    for old, new in plan.items():
        n = broken.get(old, 0)
        t = " + trusted_sources" if old in broken_trusted else ""
        g = f" + crawl_logs {broken_logs[old]}행" if broken_logs.get(old) else ""
        print(f"  {old!r} → {new!r} : auditions {n}건{t}{g}")

    if not args.apply:
        print("\ndry-run. 실제 반영은 --apply.")
        return 0

    # 2) trusted_sources 먼저 — 잠깐이라도 '신뢰 출처인데 이름이 안 맞는' 구간을 만들지 않는다
    #    (둘 중 어느 쪽을 먼저 고쳐도 그 사이 공고는 비신뢰로 보이지만, 그건 안전한 방향이다)
    for old, new in plan.items():
        if old not in broken_trusted:
            continue
        row = next(r for r in trusted if r["source_name"] == old)
        if any(r["source_name"] == new for r in trusted):
            sb.table("trusted_sources").delete().eq("source_name", old).execute()
            print(f"  trusted_sources: {old!r} 삭제 (정상 이름 {new!r}이 이미 있음)")
        else:
            sb.table("trusted_sources").update({"source_name": new}).eq("source_name", old).execute()
            print(f"  trusted_sources: {old!r} → {new!r}")

    # 3) auditions
    for old, new in plan.items():
        ids = [r["id"] for r in auds if r.get("source_name") == old]
        for i in range(0, len(ids), UPDATE_CHUNK):
            sb.table("auditions").update({"source_name": new}).in_("id", ids[i:i + UPDATE_CHUNK]).execute()
        if ids:
            print(f"  auditions: {len(ids)}건 {old!r} → {new!r}")

    # 4) crawl_logs — 소스 이력이 갈라지면 사망 판정(2-4)이 정상 이름을 "이력 없음"으로 본다
    for old, new in plan.items():
        ids = [r["id"] for r in logs if r.get("source_name") == old]
        for i in range(0, len(ids), UPDATE_CHUNK):
            sb.table("crawl_logs").update({"source_name": new}).in_("id", ids[i:i + UPDATE_CHUNK]).execute()
        if ids:
            print(f"  crawl_logs: {len(ids)}행 {old!r} → {new!r}")

    print("\n✓ 정정 완료.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
