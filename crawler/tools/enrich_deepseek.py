# -*- coding: utf-8 -*-
"""공고 정보 보강 배치 — DeepSeek V4-Flash 단일 호출로 지원경로·자격·카테고리를 한 번에 추출.

배경(2026-08-28 실측): 활성 4,426건 중 apply_email 91.8%·requirements 98.6%·sub_category 100% 결손.
정규식이 못 뽑은 정보가 원문에 남아 있어, 크롤링 확대보다 기존 데이터 보강이 우선.

**DB에 쓰지 않는다.** 결과는 logs/enrich_<ts>.jsonl 에만 적재하고, 반영은 사람이 검토 후 별도 결정.
재실행 시 이미 처리한 id는 건너뛴다(--out 을 같은 파일로 주면 이어서 진행).

사용:
  python tools/enrich_deepseek.py --limit 20          # 표본
  python tools/enrich_deepseek.py --all --out logs/enrich.jsonl
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))

from openai import OpenAI
from supabase import create_client

MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash")

SYSTEM = """오디션 공고 원문에서 아래 항목만 추출해 JSON으로 반환. 원문에 없으면 null. 추측 금지.

{
  "apply_email": "지원 접수 이메일 1개. 문의용/사이트운영용 말고 실제 접수처만. 없으면 null",
  "apply_method": "지원 방법 한 줄 요약(예: 프로필+자소 영상 이메일 제출). 없으면 null",
  "apply_url": "지원 폼/구글폼/네이버폼 URL. 없으면 null",
  "apply_kakao": "카카오톡 오픈채팅/채널 링크나 ID. 없으면 null",
  "requirements": "지원 자격을 한 줄로(나이·성별·경력·조건). 없으면 null",
  "category": "배우|모델|가수|아이돌|댄서|성우|MC/진행자|인플루언서|키즈모델|촬영모델|뮤지컬|연극|트로트|엑스트라|스태프|기타 중 하나",
  "sub_category": "주연|조연|단역|엑스트라|보조출연|신인모집|공개오디션|촬영모델|광고|기타 중 하나",
  "pay_type": "회차당|일당|시급|월급|건당|무급|협의|미기재 중 하나",
  "pay_amount": "금액 숫자만(원 단위 정수). 범위면 하한. 없으면 null",
  "is_paid": "보수 지급 여부 true/false. 무급·자원봉사면 false",
  "confidence": "추출 확신도 0.0~1.0"
}

JSON만 출력. 설명·코드블록 금지."""


def build_output_row(row: dict, d: dict) -> dict:
    """결과 행 조립. 모델 JSON(d)이 id/title/source_name 같은 고정 식별 필드를
    덮어쓰지 못하도록 고정 필드를 마지막에 둔다(d에 id가 섞여 있으면 먼저 제거)."""
    d = dict(d)
    d.pop("id", None)
    return {**d, "id": row["id"], "title": row.get("title"), "source_name": row.get("source_name")}


def build_client() -> OpenAI:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        sys.exit("DEEPSEEK_API_KEY 없음 — crawler/.env 확인")
    return OpenAI(api_key=key, base_url="https://api.deepseek.com", timeout=60.0, max_retries=2)


def extract(client: OpenAI, row: dict) -> dict | None:
    body = (row.get("description") or "")[:1500]
    req = row.get("requirements") or ""
    text = f"제목: {row.get('title') or ''}\n기존자격: {req}\n\n본문:\n{body}"
    try:
        r = client.chat.completions.create(
            model=MODEL,
            max_tokens=400,
            temperature=1.0,
            extra_body={"thinking": {"type": "disabled"}},
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}],
        )
        raw = (r.choices[0].message.content or "").strip()
        if not raw:
            return {"_error": "empty_response"}
        data = json.loads(raw)
        u = r.usage
        data["_usage"] = {"in": u.prompt_tokens, "out": u.completion_tokens,
                          "cache_hit": getattr(u, "prompt_cache_hit_tokens", 0)}
        return data
    except json.JSONDecodeError as e:
        return {"_error": f"json_decode: {e}"}
    except Exception as e:
        return {"_error": f"{type(e).__name__}: {e}"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--all", action="store_true", help="apply_email 결손 전량")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    out_path = args.out or os.path.join("logs", "enrich_sample.jsonl")
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    done: set[str] = set()
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    # 실패 행(_error 있음)은 done에 넣지 않는다 — 재실행 시 재시도 가능하게
                    if "_error" not in rec:
                        done.add(rec["id"])
                except Exception:
                    pass
        print(f"이미 처리됨 {len(done):,}건 — 건너뜀")

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    cols = "id,title,description,requirements,category,apply_email,source_name"

    rows, off = [], 0
    while True:
        b = (sb.table("auditions").select(cols).eq("is_active", True)
             .is_("apply_email", "null").order("id").range(off, off + 999).execute().data)
        if not b:
            break
        rows += b
        off += 1000
        if not args.all and len(rows) >= args.limit * 3:
            break
    # 본문이 있는 것만 (없으면 뽑을 게 없다)
    rows = [r for r in rows if (r.get("description") or "").strip() and r["id"] not in done]
    if not args.all:
        rows = rows[: args.limit]
    print(f"대상 {len(rows):,}건 → {out_path}\n")

    client = build_client()
    tin = tout = ok = err = 0
    t0 = time.time()
    with open(out_path, "a", encoding="utf-8") as f:
        for i, row in enumerate(rows, 1):
            d = extract(client, row) or {"_error": "none"}
            if "_error" in d:
                err += 1
            else:
                ok += 1
                u = d.pop("_usage", {})
                tin += u.get("in", 0)
                tout += u.get("out", 0)
            f.write(json.dumps(build_output_row(row, d), ensure_ascii=False) + "\n")
            f.flush()
            if i % 25 == 0 or i == len(rows):
                cost = tin / 1e6 * 0.22 + tout / 1e6 * 0.66  # 오프피크 기준
                print(f"  {i:,}/{len(rows):,}  성공 {ok:,} 실패 {err:,}  "
                      f"토큰 in {tin:,} out {tout:,}  누적 ${cost:.4f}  {time.time()-t0:.0f}s", flush=True)

    cost = tin / 1e6 * 0.22 + tout / 1e6 * 0.66
    print(f"\n완료: 성공 {ok:,} / 실패 {err:,} / 비용 약 ${cost:.4f} (오프피크 기준)")
    print(f"결과: {out_path}  — DB는 건드리지 않았습니다.")


if __name__ == "__main__":
    main()
