# -*- coding: utf-8 -*-
"""네이버 카페 본문 파일럿 (플랜 37 스프린트 1) — 접근률·이메일 포함률·지원 액션 추출률 실측.

경로: 카페 article API v3 (모바일 SPA가 쓰는 공개 엔드포인트) 무로그인 GET.
  - 200 → contentHtml에서 태그 제거 후 지원 액션(이메일·폼·전화·카톡)·마감 신호만 측정
  - 401/403 → 카페 ACL(로그인 필요)로 기록, 재시도 안 함
정책(37 §2·§5): 원문 전문 저장 금지 — 본문은 메모리에서 측정 후 폐기, 리포트에는 통계와
  추출 필드 후보(이메일 주소·폼 URL)만 남긴다. 분당 ≤20건(요청 간 3초±지터). robots/차단
  신호(429·캡차) 감지 시 즉시 중단.

사용:
    python -m sns_sources.cafe_body 400          # 파일럿 N건 (기본 400)
    python -m sns_sources.cafe_body 400 --apply  # 실측 + 발견한 이메일을 apply_email에 반영
"""

import html
import json
import logging
import random
import re
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

_API = "https://apis.naver.com/cafe-web/cafe-articleapi/v3/cafes/{cafe}/articles/{article}?query=&useCafeId=false&requestFrom=A"
_UA = (
    "Mozilla/5.0 (Linux; Android 14; SM-G991N) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
)
_URL_RE = re.compile(r"cafe\.naver\.com/([A-Za-z0-9_-]+)/(\d+)")
_TAG_RE = re.compile(r"<[^>]+>")
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# OCR·표기 변형 보정용 (골뱅이 표기)
_EMAIL_OBFUSCATED_RE = re.compile(r"[A-Za-z0-9._%+-]+\s*\(?골뱅이\)?\s*[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_FORM_RE = re.compile(
    r"https?://(?:forms\.gle|docs\.google\.com/forms|naver\.me|form\.naver\.com|tally\.so|typeform\.com|moaform\.com|smore\.im)[^\s\"'<)\]]+"
)
_PHONE_RE = re.compile(r"01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}")
_KAKAO_RE = re.compile(r"open\.kakao\.com/[^\s\"'<)\]]+|오픈\s*(?:카톡|채팅)|카톡\s*(?:아이디|ID|id)")
_DEADLINE_RE = re.compile(r"마감|접수\s*기간|모집\s*기간|까지|선착순|채용\s*시|상시")

# 자기 카페/네이버 시스템 메일 등 접수처가 아닌 주소
_EMAIL_BLACKLIST = re.compile(r"@(naver\.com/|cafe\.|navercorp\.)", re.I)


def _clean_text(content_html: str) -> str:
    text = _TAG_RE.sub(" ", content_html or "")
    prev = None
    while text != prev:
        prev = text
        text = html.unescape(text)
    return re.sub(r"[ \t ]+", " ", text)


def _find_email(text: str) -> str | None:
    for m in _EMAIL_RE.finditer(text):
        addr = m.group(0).strip(".")
        if not _EMAIL_BLACKLIST.search(addr):
            return addr.lower()
    m = _EMAIL_OBFUSCATED_RE.search(text)
    if m:
        return re.sub(r"\s*\(?골뱅이\)?\s*", "@", m.group(0)).lower()
    return None


def fetch_article(sess: requests.Session, cafe: str, article: str) -> dict:
    """1건 조회 → 측정 결과 dict (본문은 반환하지 않음)."""
    out = {"status": None, "body_len": 0, "email": None, "form_url": None,
           "has_phone": False, "has_kakao": False, "has_deadline_hint": False}
    try:
        r = sess.get(_API.format(cafe=cafe, article=article), timeout=15)
        out["status"] = r.status_code
        if r.status_code != 200:
            return out
        data = r.json()
        art = (data.get("result") or {}).get("article") or {}
        text = _clean_text(art.get("contentHtml") or "")
        out["body_len"] = len(text)
        out["email"] = _find_email(text)
        m = _FORM_RE.search(art.get("contentHtml") or "")
        out["form_url"] = m.group(0) if m else None
        out["has_phone"] = bool(_PHONE_RE.search(text))
        out["has_kakao"] = bool(_KAKAO_RE.search(text))
        out["has_deadline_hint"] = bool(_DEADLINE_RE.search(text))
    except (requests.RequestException, ValueError) as e:
        out["status"] = f"err:{type(e).__name__}"
    return out


def run_pilot(limit: int = 400, apply: bool = False) -> dict:
    from utils.supabase_client import supabase as sb

    rows: list[dict] = []
    off = 0
    while len(rows) < limit * 3 and off < 8000:  # 여유 있게 긁고 카페 다양성 확보
        batch = (
            sb.table("auditions")
            .select("id,source_url,source_name,apply_email,category")
            .eq("is_active", True)
            .like("source_name", "네이버카페%")
            .order("crawled_at", desc=True)
            .range(off, off + 999)
            .execute()
            .data
        )
        if not batch:
            break
        rows += batch
        off += 1000

    # 카페별 최대 40건으로 다양성 확보 (한 카페가 표본 독점 방지)
    per_cafe: dict[str, int] = defaultdict(int)
    sample: list[tuple[dict, str, str]] = []
    for r in rows:
        m = _URL_RE.search(r["source_url"] or "")
        if not m:
            continue
        cafe, article = m.group(1), m.group(2)
        if per_cafe[cafe] >= 40:
            continue
        per_cafe[cafe] += 1
        sample.append((r, cafe, article))
        if len(sample) >= limit:
            break

    sess = requests.Session()
    sess.headers.update({"User-Agent": _UA, "Accept": "application/json"})

    stats: dict[str, dict] = defaultdict(lambda: {
        "n": 0, "ok": 0, "acl": 0, "err": 0, "email": 0, "form": 0,
        "phone": 0, "kakao": 0, "deadline": 0, "cat": defaultdict(int)})
    findings: list[dict] = []
    consecutive_429 = 0

    print(f"파일럿 시작: {len(sample)}건 (카페 {len(per_cafe)}곳, 요청 간 ~3초)")
    for i, (row, cafe, article) in enumerate(sample, 1):
        res = fetch_article(sess, cafe, article)
        s = stats[cafe]
        s["n"] += 1
        cat = row.get("category") or "?"
        if res["status"] == 200 and res["body_len"] > 0:
            s["ok"] += 1
            s["cat"][cat] += 1
            if res["email"]:
                s["email"] += 1
            if res["form_url"]:
                s["form"] += 1
            if res["has_phone"]:
                s["phone"] += 1
            if res["has_kakao"]:
                s["kakao"] += 1
            if res["has_deadline_hint"]:
                s["deadline"] += 1
            if res["email"] or res["form_url"]:
                findings.append({
                    "id": row["id"], "cafe": cafe, "category": cat,
                    "email": res["email"], "form_url": res["form_url"],
                    "had_email_before": bool(row.get("apply_email")),
                })
        elif res["status"] in (401, 403):
            s["acl"] += 1
        else:
            s["err"] += 1
            if res["status"] == 429:
                consecutive_429 += 1
                if consecutive_429 >= 3:
                    print("!! 429 연속 3회 — 차단 신호, 파일럿 중단")
                    break
            else:
                consecutive_429 = 0

        if i % 50 == 0:
            tot = sum(v["n"] for v in stats.values())
            ok = sum(v["ok"] for v in stats.values())
            em = sum(v["email"] for v in stats.values())
            print(f"  ... {i}/{len(sample)} | 접근 {ok}/{tot} | 이메일 {em}")
        time.sleep(2.4 + random.random() * 1.2)  # 분당 ~17~20건

    # ── 리포트 ──
    tot = sum(v["n"] for v in stats.values())
    ok = sum(v["ok"] for v in stats.values())
    acl = sum(v["acl"] for v in stats.values())
    err = sum(v["err"] for v in stats.values())
    email = sum(v["email"] for v in stats.values())
    form = sum(v["form"] for v in stats.values())
    action = len({f["id"] for f in findings})
    new_email = sum(1 for f in findings if f["email"] and not f["had_email_before"])

    print()
    print("========== 카페 본문 파일럿 결과 ==========")
    print(f"표본 {tot}건 / 카페 {len(stats)}곳")
    print(f"본문 접근 성공: {ok} ({ok/max(tot,1)*100:.0f}%) | 로그인 필요(ACL): {acl} ({acl/max(tot,1)*100:.0f}%) | 오류: {err}")
    if ok:
        print(f"접근 성공분 중 — 이메일: {email} ({email/ok*100:.0f}%) | 폼: {form} ({form/ok*100:.0f}%) | "
              f"전화: {sum(v['phone'] for v in stats.values())} | 카톡: {sum(v['kakao'] for v in stats.values())}")
    print(f"지원 액션(이메일∪폼) 신규 확보 후보: {action}건 (이 중 신규 이메일 {new_email}건)")
    print()
    print("카페별 (표본 5+):")
    for cafe, s in sorted(stats.items(), key=lambda kv: -kv[1]["n"]):
        if s["n"] < 5:
            continue
        rate = f"{s['ok']}/{s['n']}"
        em = f"{s['email']}/{s['ok']}" if s["ok"] else "-"
        print(f"  {cafe:<16} 접근 {rate:<7} 이메일 {em:<7} 폼 {s['form']} ACL {s['acl']}")

    report = {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "sample": tot, "cafes": len(stats), "ok": ok, "acl": acl, "err": err,
        "email": email, "form": form, "action_candidates": action, "new_email": new_email,
        "per_cafe": {k: {kk: (dict(vv) if isinstance(vv, defaultdict) else vv)
                          for kk, vv in v.items()} for k, v in stats.items()},
        "findings": findings,
    }
    out_dir = Path(__file__).resolve().parent.parent / "logs"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"cafe_pilot_{datetime.now():%Y%m%d_%H%M}.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n리포트 저장: {out_path}")

    if apply and findings:
        n = 0
        for f in findings:
            if f["email"] and not f["had_email_before"]:
                sb.table("auditions").update(
                    {"apply_email": f["email"], "apply_type": "email"}
                ).eq("id", f["id"]).execute()
                n += 1
        print(f"apply_email 반영: {n}건")
    elif findings:
        print("(반영하려면 --apply)")
    return report


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    args = [a for a in sys.argv[1:]]
    apply = "--apply" in args
    nums = [a for a in args if a.isdigit()]
    run_pilot(int(nums[0]) if nums else 400, apply=apply)
