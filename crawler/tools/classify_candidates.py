# -*- coding: utf-8 -*-
"""소스 후보(source_candidates) 자동 분류 — DeepSeek V4-Flash.

배경(2026-08-28): status='new' 604건이 검수 화면 없이 방치됨. 국립극단·세종문화회관·
콘테스트코리아(발견 1,213회) 같은 우량 소스가 대기열에 묻혀 있다.

3분류만 한다: approve(우량) / reject(부적합) / review(사람 판단).
**DB에 쓰지 않는다.** 결과는 logs/candidates_classified.jsonl 에만 적재.

사용: python tools/classify_candidates.py [--limit N]
"""
from __future__ import annotations

import argparse, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))
from openai import OpenAI
from supabase import create_client

SYSTEM = """오디션·캐스팅 정보 수집 서비스의 '소스 후보'를 분류한다.
입력은 발견된 도메인/계정 1건 + 발견 경로 + 대표 제목.

{
  "verdict": "approve | reject | review",
  "source_type": "공공기관|국공립예술단체|전문캐스팅사이트|제작사·기획사|아카데미·학원|공모전포털|채용포털|커뮤니티·카페|개인블로그·SNS|애그리게이터|무관",
  "reason": "한 줄 근거(40자 이내)",
  "risk": "none|low|medium|high"
}

approve 기준: **배역·출연자를 뽑는** 오디션/캐스팅 공고가 반복적으로 나오는 곳.
  공공기관(.go.kr/.or.kr)·국공립 예술단체·전문 캐스팅 사이트·제작사 공식 페이지는 적극 approve.

reject 기준:
  - 일반 채용(제조·물류·사무)·쇼핑몰·병원/시술·대출·성인·중고거래·맘카페 일상글
  - 이미 수집 중인 애그리게이터, 오디션과 무관한 주제
  - **아카데미·학원의 수강생/교육생 모집** — "정규반·단과반·종합반·기수 모집·과정 모집·
    개강·수강료·교육생 모집"은 배역을 뽑는 게 아니라 **강의를 파는 것**이다. 오디션이 아니다.
    (2026-08-28 실측: 승인 후 "쇼호스트아카데미 정규반 모집"류가 공고로 들어와 회수했다.
     참가비·교육비 유도는 이 서비스가 가장 경계하는 유형이라 특히 엄격히 본다.)
  - 학원이 자기 홍보로 다는 "단독추천·수강생 데뷔" 류 모델 모집

단, 아카데미·학원이라도 **자체 공연/작품의 배역을 뽑는 공고**가 주라면 approve 가능하다.
판단 근거가 "수강생을 모은다"면 reject, "배역을 뽑는다"면 approve.

review: 판단이 갈리거나 정보가 부족한 경우. 애매하면 review. 추측으로 approve 하지 말 것.

JSON만 출력."""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="logs/candidates_classified.jsonl")
    args = ap.parse_args()

    os.makedirs("logs", exist_ok=True)
    done = set()
    if os.path.exists(args.out):
        for line in open(args.out, encoding="utf-8"):
            try: done.add(json.loads(line)["id"])
            except Exception: pass
        print(f"이미 처리 {len(done):,}건 건너뜀")

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows, off = [], 0
    while True:
        b = (sb.table("source_candidates").select("id,url,kind,found_by,hits,sample_title")
             .eq("status", "new").order("hits", desc=True).range(off, off + 999).execute().data)
        if not b: break
        rows += b; off += 1000
    rows = [r for r in rows if r["id"] not in done]
    if args.limit: rows = rows[: args.limit]
    print(f"대상 {len(rows):,}건 → {args.out}\n")

    client = OpenAI(api_key=os.environ["DEEPSEEK_API_KEY"], base_url="https://api.deepseek.com",
                    timeout=60.0, max_retries=2)
    tin = tout = ok = err = 0
    t0 = time.time()
    with open(args.out, "a", encoding="utf-8") as f:
        for i, r in enumerate(rows, 1):
            user = (f"URL: {r['url']}\n종류: {r['kind']}\n발견경로: {r.get('found_by')}\n"
                    f"발견횟수: {r.get('hits')}\n대표제목: {(r.get('sample_title') or '')[:200]}")
            try:
                resp = client.chat.completions.create(
                    model=os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
                    max_tokens=200, temperature=1.0,
                    extra_body={"thinking": {"type": "disabled"}},
                    response_format={"type": "json_object"},
                    messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                )
                d = json.loads((resp.choices[0].message.content or "{}").strip())
                u = resp.usage; tin += u.prompt_tokens; tout += u.completion_tokens
                ok += 1
            except Exception as e:
                d = {"verdict": "review", "_error": f"{type(e).__name__}: {e}"}
                err += 1
            f.write(json.dumps({**{k: r.get(k) for k in ("id", "url", "kind", "hits", "sample_title", "found_by")}, **d},
                               ensure_ascii=False) + "\n")
            f.flush()
            if i % 50 == 0 or i == len(rows):
                cost = tin / 1e6 * 0.22 + tout / 1e6 * 0.66
                print(f"  {i:,}/{len(rows):,}  성공 {ok:,} 실패 {err:,}  ${cost:.4f}  {time.time()-t0:.0f}s", flush=True)

    print(f"\n완료 — DB 미변경. 결과: {args.out}")


if __name__ == "__main__":
    main()
