# -*- coding: utf-8 -*-
"""인테이크 에이전트 CLI (플랜 38) — 어떤 형태의 공고든 검수 후보(pending)로 변환.

권한 경계(38 §3, 코드로 강제): 이 CLI는 parse/validate/preview/upsert(pending·quarantine)만
제공한다. publish·원클릭 활성화 명령은 존재하지 않는다 — 승격은 tools/review.py(운영자).
LLM 계약(38 §2): 에이전트가 후보 JSON을 보정할 때는 status='llm_extracted_with_evidence'와
evidence(원문 스니펫 80~160자)를 반드시 넣는다. evidence 없는 LLM 필드는 upsert 시 기각된다.
전문 저장 금지: 원문은 필드 추출에만 쓰고 폐기, 후보에는 사실 필드+근거 스니펫만 남는다.

사용:
  [파이프라인 모드 — 크롤러 잔여물 자동 가공 (기본 흐름)]
    python -m tools.ingest queue                 # 가공 필요분 선별(마감·이메일·폼 전부 없는 공고 등)
    python -m tools.ingest process --limit 50    # 원문 재조회(공개 경로만) → 규칙 재추출 → 필드 업데이트
    → process 후에도 남는 잔여물 = 에이전트 배치 대상 (/ingest 스킬 큐 모드)
  [수동 투입 모드 — 운영자/유저가 직접 주는 자료]
    python -m tools.ingest parse --text-file 공고.txt [--source-url URL]
    python -m tools.ingest parse --url https://...
    python -m tools.ingest upsert crawler/intake/<id>.json
"""

import argparse
import json
import re
import sys
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from scrapers.base import AuditionData, BaseScraper
from utils.risk import risk_score
from utils.email_extract import is_apply_email

INTAKE_DIR = Path(__file__).resolve().parent.parent / "intake"
SCHEMA_VERSION = "intake-v1"
PARSER_VERSION = "2026-08-25"

_FORM_RE = re.compile(
    r"https?://(?:forms\.gle|docs\.google\.com/forms|naver\.me|form\.naver\.com|tally\.so|typeform\.com|moaform\.com|smore\.im)[^\s\"'<)\]]+"
)
_NO_PROXY_RE = re.compile(r"대리\s*(?:지원|접수|발송)\s*(?:불가|금지)|본인\s*직접\s*(?:지원|접수)")


def _valid_apply_email(email: str | None) -> str | None:
    """접수처로 쓸 수 있는 메일만 통과. 판정은 utils.email_extract가 정본."""
    if not email:
        return None
    email = email.strip().lower()
    return email if is_apply_email(email) else None
_LINE_EVIDENCE = 160


class _Helper(BaseScraper):
    source_name = "인테이크"
    base_url = ""

    def scrape(self):  # pragma: no cover - CLI 헬퍼
        return []


def _evidence_line(text: str, needle: str) -> str:
    """needle이 포함된 줄(±주변)을 근거 스니펫으로. 최대 160자 — 전문 저장 금지."""
    for line in text.splitlines():
        if needle and needle in line:
            return line.strip()[:_LINE_EVIDENCE]
    return (needle or "")[:_LINE_EVIDENCE]


def _field(value, status, confidence, evidence=""):
    return {"value": value, "status": status, "confidence": confidence,
            "evidence": (evidence or "")[:_LINE_EVIDENCE]}


def extract_fields(text: str) -> dict:
    """규칙 추출 — LLM 이전 단계. 값이 없으면 missing으로 두고 절대 지어내지 않는다."""
    h = _Helper()
    fields: dict = {}

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    title = lines[0][:150] if lines else ""
    fields["title"] = _field(title, "verified_rule" if title else "missing",
                             0.7 if title else 0.0, title)

    email = _valid_apply_email(BaseScraper.extract_email(text))
    fields["apply_email"] = _field(email, "verified_rule" if email else "missing",
                                   0.95 if email else 0.0,
                                   _evidence_line(text, email) if email else "")

    m = _FORM_RE.search(text)
    fields["form_url"] = _field(m.group(0) if m else None,
                                "verified_rule" if m else "missing",
                                0.95 if m else 0.0,
                                _evidence_line(text, m.group(0)) if m else "")

    dl = BaseScraper.parse_deadline_smart(text, require_label=True)
    fields["deadline"] = _field(dl.isoformat() if dl else None,
                                "verified_rule" if dl else "missing",
                                0.8 if dl else 0.0,
                                _evidence_line(text, "마감") or _evidence_line(text, "까지"))

    phone = BaseScraper.extract_phone(text)
    fields["phone"] = _field(phone, "verified_rule" if phone else "missing",
                             0.9 if phone else 0.0,
                             _evidence_line(text, phone) if phone else "")

    loc = BaseScraper.extract_location(text)
    fields["region"] = _field(loc, "verified_rule" if loc else "missing",
                              0.6 if loc else 0.0,
                              _evidence_line(text, loc) if loc else "")

    fields["genre"] = _field(BaseScraper.classify_genre(text), "verified_rule", 0.5, "")

    # 사실 필드 요약(게시용 description 재료) — 원문 전문이 아니라 앞부분 발췌만
    summary = " ".join(lines[1:6])[:400]
    fields["summary"] = _field(summary, "verified_rule" if summary else "missing",
                               0.5 if summary else 0.0, "")
    return fields


def fetch_public_url(url: str) -> str | None:
    """공개 단일 페이지만. 로그인 유도·차단 신호면 None (우회 금지 — 38 §3)."""
    import requests
    try:
        r = requests.get(url, timeout=20, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"})
    except requests.RequestException as e:
        print(f"요청 실패: {e}")
        return None
    if r.status_code in (401, 403, 429):
        print(f"접근 차단({r.status_code}) — 우회하지 않는다. 열람 권한이 있으면 화면 캡처로 접수하라.")
        return None
    if r.status_code != 200:
        print(f"HTTP {r.status_code}")
        return None
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(r.text, "html.parser")
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    text = soup.get_text("\n", strip=True)
    if len(text) < 200 or "로그인" in text[:300]:
        print("본문이 비어 있거나 로그인 유도 페이지 — 캡처 접수 경로를 사용하라.")
        return None
    return text[:20000]


def dedup_hint(title: str) -> dict:
    try:
        from tools.dedup_report import fingerprint, similarity
        from utils.supabase_client import supabase as sb
        fp = fingerprint(title)
        if len(fp) < 8:
            return {"status": "new", "matches": []}
        rows = sb.table("auditions").select("id,title").eq("is_active", True).limit(3000).execute().data
        matches = [r["title"][:50] for r in rows if similarity(fp, fingerprint(r["title"])) >= 0.85][:3]
        return {"status": "possible_duplicate" if matches else "new", "matches": matches}
    except Exception:
        return {"status": "unknown", "matches": []}


def decide(candidate: dict) -> str:
    if candidate["risk"]["quarantine"]:
        return "QUARANTINED"
    has_public = candidate["source"]["type"] == "public_url" or bool(candidate["source"].get("url"))
    if not has_public:
        return "NEEDS_MORE_SOURCE"
    return "READY_TO_REVIEW"


def oneclick_check(candidate: dict, text_hint: str = "") -> tuple[bool, list[str]]:
    """원클릭 후보 판정 — LLM 관여 금지, 구조 검증만. 활성화는 어차피 운영자."""
    blockers = []
    f = candidate["fields"]
    if not f["apply_email"]["value"] and not f["form_url"]["value"]:
        blockers.append("지원 이메일/폼 없음")
    if not f["deadline"]["value"]:
        blockers.append("마감 미상")
    if candidate["source"]["type"] != "public_url" and not candidate["source"].get("url"):
        blockers.append("공개 출처 없음")
    if candidate["risk"]["score"] >= 4:
        blockers.append(f"위험 신호({candidate['risk']['score']})")
    if _NO_PROXY_RE.search(text_hint):
        blockers.append("대리 지원 금지 문구")
    return (not blockers), blockers


def print_summary(candidate: dict) -> None:
    f = candidate["fields"]

    def fmt(k):
        x = f[k]
        v = x["value"] if x["value"] not in (None, "") else "미확인"
        return f"{v} [{x['status']}/{x['confidence']:.2f}]"

    ok, blockers = candidate["oneclick"]["possible"], candidate["oneclick"]["blockers"]
    print(f"\n[검수 후보] 결정: {candidate['decision']}")
    print("공고")
    for label, key in (("제목", "title"), ("마감", "deadline"), ("지원 이메일", "apply_email"),
                       ("지원 폼", "form_url"), ("지역", "region"), ("장르", "genre")):
        print(f"- {label}: {fmt(key)}")
    print(f"원클릭\n- 상태: {'가능 후보' if ok else '불가'}")
    if blockers:
        print(f"- 차단 사유: {', '.join(blockers)}")
    r = candidate["risk"]
    print(f"리스크\n- score {r['score']} | 플래그: {', '.join(r['reasons']) or '없음'} | quarantine: {r['quarantine']}")
    s = candidate["source"]
    print(f"출처\n- {s['type']} | {s.get('url') or '(공개 URL 없음 — 게시 전 확보 필요)'} | dedup: {candidate['dedup']['status']}")
    missing = [k for k, v in f.items() if v["status"] == "missing"]
    if missing:
        print(f"누락: {', '.join(missing)}")
    ev = [(k, v["evidence"]) for k, v in f.items() if v["evidence"] and v["value"]]
    if ev:
        print("근거")
        for k, e in ev[:5]:
            print(f'- {k}: "{e[:80]}"')
    print(f"\n다음 명령: python -m tools.ingest upsert {candidate['path']}")
    print("(게시·원클릭 활성화는 tools/review.py — 운영자 전용)")


def cmd_parse(args) -> None:
    if args.url:
        text = fetch_public_url(args.url)
        if not text:
            sys.exit(1)
        source = {"type": "public_url", "url": args.url}
    else:
        text = Path(args.text_file).read_text(encoding="utf-8")
        source = {"type": args.source_type, "url": args.source_url}

    fields = extract_fields(text)
    score, reasons = risk_score(fields["title"]["value"] or "", text)
    cid = uuid.uuid4().hex[:12]
    candidate = {
        "schema": SCHEMA_VERSION, "parser": PARSER_VERSION, "id": cid,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "source": source, "fields": fields,
        "risk": {"score": score, "reasons": reasons, "quarantine": score >= 7},
        "dedup": dedup_hint(fields["title"]["value"] or ""),
        "llm_assisted": False,
    }
    ok, blockers = oneclick_check(candidate, text)
    candidate["oneclick"] = {"possible": ok, "blockers": blockers}
    candidate["decision"] = decide(candidate)

    INTAKE_DIR.mkdir(exist_ok=True)
    path = INTAKE_DIR / f"{cid}.json"
    candidate["path"] = str(path)
    path.write_text(json.dumps(candidate, ensure_ascii=False, indent=1), encoding="utf-8")
    print_summary(candidate)


def _validate(candidate: dict) -> list[str]:
    errors = []
    f = candidate["fields"]
    if not f["title"]["value"]:
        errors.append("title 없음")
    for key, val in f.items():
        if val["status"] == "llm_extracted_with_evidence":
            if not val["evidence"]:
                errors.append(f"{key}: LLM 필드에 evidence 없음 — 기각")
            candidate["llm_assisted"] = True
    em = f["apply_email"]["value"]
    if em and not re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", em):
        errors.append("apply_email 형식 오류")
    dl = f["deadline"]["value"]
    if dl:
        try:
            if date.fromisoformat(dl) < date.today():
                errors.append("마감일이 과거")
        except ValueError:
            errors.append("deadline 형식 오류(YYYY-MM-DD)")
    return errors


def cmd_upsert(args) -> None:
    candidate = json.loads(Path(args.candidate).read_text(encoding="utf-8"))
    errors = _validate(candidate)
    if errors:
        print("검증 실패 — 투입 중단:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    f = candidate["fields"]
    source_url = candidate["source"].get("url") or f"https://auditionpass.co.kr/intake/{candidate['id']}"
    desc_parts = [f["summary"]["value"] or ""]
    if f["region"]["value"]:
        desc_parts.append(f"지역: {f['region']['value']}")
    if f["form_url"]["value"]:
        desc_parts.append(f"지원 폼: {f['form_url']['value']}")
    desc_parts.append(f"\n---\n출처: 인테이크({candidate['source']['type']}) — 게시 전 운영자 검수 필수")

    data = AuditionData(
        title=f["title"]["value"],
        company=None,
        genre=f["genre"]["value"] or "기타",
        deadline=date.fromisoformat(f["deadline"]["value"]) if f["deadline"]["value"] else None,
        apply_email=f["apply_email"]["value"],
        description="\n".join(p for p in desc_parts if p)[:900],
        requirements=None,
        source_url=source_url,
        source_name=f"인테이크:{candidate['source']['type']}",
    )
    from utils.supabase_client import supabase as sb, upsert_auditions
    saved = upsert_auditions([data])
    # 인테이크 출처는 trusted가 아니므로 항상 pending — quarantine이면 상태 상향
    if candidate["risk"]["quarantine"]:
        sb.table("auditions").update({"review_status": "quarantine", "is_active": False}).eq(
            "source_url", source_url).execute()
    print(f"투입 완료: {saved}건 (상태: {'quarantine' if candidate['risk']['quarantine'] else 'pending'}, 비활성)")
    print("승격: python -m tools.review list / approve  (운영자)")


def _residual_rows(limit: int = 2000) -> list[dict]:
    """가공 필요 잔여물: 활성·pending 중 지원 액션(이메일)도 마감도 없는 공고."""
    from utils.supabase_client import supabase as sb
    rows: list[dict] = []
    for status_filter in ({"col": "is_active", "val": True}, {"col": "review_status", "val": "pending"}):
        off = 0
        while off < limit * 2:
            q = (sb.table("auditions")
                 .select("id,title,source_name,source_url,apply_email,deadline,description")
                 .eq(status_filter["col"], status_filter["val"])
                 .is_("apply_email", "null").is_("deadline", "null")
                 .range(off, off + 999).execute().data)
            if not q:
                break
            rows += q
            off += 1000
    seen, out = set(), []
    for r in rows:
        if r["id"] not in seen:
            seen.add(r["id"])
            out.append(r)
    return out[:limit]


def cmd_queue(args) -> None:
    from collections import Counter
    rows = _residual_rows()
    by_src = Counter(r["source_name"].split(":")[0] for r in rows)
    cafe = sum(1 for r in rows if "cafe.naver.com" in (r["source_url"] or ""))
    print(f"가공 필요 잔여물(이메일·마감 모두 없음): {len(rows)}건")
    for s, n in by_src.most_common(12):
        print(f"  {n:5d}  {s}")
    print(f"\n경로: 네이버카페 {cafe}건(cafe API — 백필과 중복 주의) / 기타 공개 URL {len(rows)-cafe}건")
    print("다음: python -m tools.ingest process --limit 50 [--include-cafe]")


def cmd_process(args) -> None:
    """잔여물 규칙 재가공 — 공개 경로만 재조회, LLM 없음. 남는 것이 에이전트 배치 대상."""
    import time, random
    from utils.supabase_client import supabase as sb

    rows = _residual_rows()
    if not args.include_cafe:
        rows = [r for r in rows if "cafe.naver.com" not in (r["source_url"] or "")]
    rows = [r for r in rows if (r["source_url"] or "").startswith("http")][: args.limit]

    stats = {"tried": 0, "fetched": 0, "email": 0, "deadline": 0, "blocked": 0}
    agent_residual: list[dict] = []
    for r in rows:
        stats["tried"] += 1
        url = r["source_url"]
        if "cafe.naver.com" in url:
            from sns_sources.cafe_body import fetch_article, _URL_RE as CAFE_RE
            m = CAFE_RE.search(url)
            text = None
            if m:
                import requests as rq
                sess = rq.Session()
                sess.headers.update({"User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile Safari/537.36"})
                res = fetch_article(sess, m.group(1), m.group(2), with_text=True)
                text = res.get("text")
        else:
            text = fetch_public_url(url)
        if not text:
            stats["blocked"] += 1
            agent_residual.append({"id": r["id"], "title": r["title"][:60], "url": url, "reason": "원문 접근 실패"})
            time.sleep(1.5)
            continue
        stats["fetched"] += 1
        f = extract_fields(text)
        update = {}
        if f["apply_email"]["value"] and not r["apply_email"]:
            update["apply_email"] = f["apply_email"]["value"]
            update["apply_type"] = "email"
            stats["email"] += 1
        if f["deadline"]["value"] and not r["deadline"]:
            update["deadline"] = f["deadline"]["value"]
            stats["deadline"] += 1
            # 뒤늦게 채운 마감이 이미 지났으면 여기서 내린다 — 크롤러의 만료 처리는 이미 끝난 뒤라
            # 여기서 안 내리면 다음 실행까지 "마감 지났는데 활성"으로 남는다(실측 2건, 2-4)
            if f["deadline"]["value"] < date.today().isoformat():
                update["is_active"] = False
                stats["expired_late"] = stats.get("expired_late", 0) + 1
        if update:
            sb.table("auditions").update(update).eq("id", r["id"]).execute()
        else:
            agent_residual.append({"id": r["id"], "title": r["title"][:60], "url": url, "reason": "규칙 추출 실패(본문 있음)"})
        time.sleep(2.0 + random.random())

    print(f"\nprocess 결과: 시도 {stats['tried']} | 원문 확보 {stats['fetched']} | "
          f"이메일 +{stats['email']} | 마감 +{stats['deadline']} | 접근 실패 {stats['blocked']}"
          + (f" | 뒤늦은 마감으로 비활성 {stats['expired_late']}" if stats.get("expired_late") else ""))
    # DB가 정본(017) — 어드민 인테이크 면이 이걸 읽는다.
    # JSON은 기존 /ingest 스킬 흐름 호환을 위해 계속 함께 쓴다.
    synced = _sync_agent_queue(sb, agent_residual, [r["id"] for r in rows])

    if agent_residual:
        INTAKE_DIR.mkdir(exist_ok=True)
        qpath = INTAKE_DIR / "agent_queue.json"
        qpath.write_text(json.dumps(agent_residual, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"에이전트 배치 대상 {len(agent_residual)}건 → {qpath}{synced}")
        print("처리: Claude Code에서 '/ingest 큐 처리' (규칙이 못 푼 잔여물을 에이전트가 전사·보정)")


def _sync_agent_queue(sb, residual: list[dict], processed_ids: list[str]) -> str:
    """잔여물을 agent_queue(017)에 반영. 017 미적용이면 조용히 건너뛴다(JSON 경로는 유지).

    - 남은 잔여물: 공고당 1행 upsert (재실행해도 쌓이지 않음)
    - 이번에 해결된 건: 열린 행을 resolved로 닫는다 (운영자가 같은 걸 또 보지 않게)
    """
    if not processed_ids:
        return ""
    now = datetime.now(timezone.utc).isoformat()
    residual_ids = {r["id"] for r in residual}
    try:
        if residual:
            sb.table("agent_queue").upsert(
                [
                    {
                        "audition_id": r["id"],
                        "title": r["title"],
                        "url": r["url"],
                        "reason": r["reason"],
                        "status": "open",
                        "last_seen": now,
                    }
                    for r in residual
                ],
                on_conflict="audition_id",
            ).execute()
        # 이번 회차에 규칙으로 풀린 공고는 큐에서 닫는다
        fixed = [i for i in processed_ids if i not in residual_ids]
        if fixed:
            sb.table("agent_queue").update(
                {"status": "resolved", "resolved_by": "ingest.process", "resolved_at": now}
            ).in_("audition_id", fixed).eq("status", "open").execute()
        return " (DB 동기화 완료)"
    except Exception as e:
        print(f"  [경고] agent_queue 동기화 생략(017 미적용?): {e}")
        return " (DB 동기화 생략)"


def main() -> None:
    ap = argparse.ArgumentParser(prog="ingest")
    sub = ap.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("queue")
    q.set_defaults(func=cmd_queue)
    pr = sub.add_parser("process")
    pr.add_argument("--limit", type=int, default=50)
    pr.add_argument("--include-cafe", action="store_true",
                    help="카페 API 재조회 포함 (cafe_body 백필과 동시 실행 금지)")
    pr.set_defaults(func=cmd_process)
    p = sub.add_parser("parse")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--text-file")
    src.add_argument("--url")
    p.add_argument("--source-url", default=None)
    p.add_argument("--source-type", default="user_submitted_text",
                   choices=["user_submitted_text", "user_submitted_screenshot",
                            "private_message_forward", "official_account_dm"])
    p.set_defaults(func=cmd_parse)
    u = sub.add_parser("upsert")
    u.add_argument("candidate")
    u.set_defaults(func=cmd_upsert)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
