"""
crawl_logs 실기록 + 수율 학습 (30 마스터플랜 2-4, 2026-08-22).

- record(): 소스별 1행. details(jsonb)에 세부 통계(키워드별 수율·제외 사유·카페별 수율)를 넣는다.
- learn_low_yield(): 최근 N회 실행의 details를 모아 저수율 키워드/카페를 산출 → 다음 실행에서 자동 강등.
  규칙(31 §5 KPI 게이트 자동화): 누적 수신 ≥ MIN_SAMPLE 이고 통과율 < MIN_RATE 이면 강등. 강등돼도 영구 제외가 아니라
  "이번 실행 스킵"이며, 기록은 남아 임계치를 바꾸면 복귀한다.
- 소스 생존 경보: recent_zero_days() — 최근 D일 신규 저장 0건인 소스 목록(로그로 경고).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, timedelta

from utils.supabase_client import supabase

logger = logging.getLogger(__name__)

MIN_SAMPLE = 150      # 키워드/카페 누적 수신이 이보다 적으면 판단 보류
MIN_RATE = 0.15       # 통과율(저장/수신) 임계치
LOOKBACK_RUNS = 14    # 최근 실행 수


def record(source_name: str, *, collected: int, saved: int, expired: int = 0, dups: int = 0,
           by_keyword: int = 0, by_rule: int = 0, by_ai: int = 0, errors: str | None = None,
           duration: float | None = None, details: dict | None = None) -> None:
    row = {
        "run_date": date.today().isoformat(),
        "source_name": source_name,
        "total_collected": collected,
        "total_saved": saved,
        "duplicates_skipped": dups,
        "expired_skipped": expired,
        "classified_by_keyword": by_keyword,
        "classified_by_rule": by_rule,
        "classified_by_ai": by_ai,
        "errors": errors,
        "duration_seconds": duration,
    }
    if details is not None:
        row["details"] = details
    try:
        supabase.table("crawl_logs").insert(row).execute()
    except Exception as e:  # 010 미적용(details 컬럼 없음) 등 — 로그만 남기고 크롤러는 계속
        msg = str(e)
        if "details" in msg and details is not None:
            row.pop("details", None)
            try:
                supabase.table("crawl_logs").insert(row).execute()
                logger.warning("crawl_logs.details 컬럼 없음(010 미적용) — 세부 통계 없이 기록")
                return
            except Exception as e2:
                msg = str(e2)
        logger.warning(f"crawl_logs 기록 실패 [{source_name}]: {msg[:120]}")


def _recent_details(source_name: str, runs: int = LOOKBACK_RUNS) -> list[dict]:
    try:
        res = (
            supabase.table("crawl_logs").select("details")
            .eq("source_name", source_name).not_.is_("details", "null")
            .order("created_at", desc=True).limit(runs).execute()
        )
        return [r["details"] for r in (res.data or []) if r.get("details")]
    except Exception as e:
        logger.warning(f"crawl_logs 조회 실패: {str(e)[:100]}")
        return []


def learn_low_yield(source_name: str, field: str) -> set[str]:
    """details[field] = {name: {"fetched": n, "saved": m}} 누적 → 저수율 name 집합."""
    fetched: dict[str, int] = defaultdict(int)
    saved: dict[str, int] = defaultdict(int)
    for d in _recent_details(source_name):
        for name, st in (d.get(field) or {}).items():
            fetched[name] += int(st.get("fetched", 0))
            saved[name] += int(st.get("saved", st.get("passed", 0)))
    demoted = {n for n, f in fetched.items() if f >= MIN_SAMPLE and saved[n] / f < MIN_RATE}
    if demoted:
        logger.info(f"[{source_name}] 저수율 {field} {len(demoted)}개 자동 강등(통과율<{MIN_RATE:.0%}, 표본≥{MIN_SAMPLE}): "
                    + ", ".join(sorted(demoted)[:10]) + (" …" if len(demoted) > 10 else ""))
    return demoted


def recent_zero_days(days: int = 3) -> list[str]:
    """최근 days일 동안 저장 0건인 소스. `dead_sources`의 하위 호환 래퍼."""
    dead, never = dead_sources(days)
    return sorted(dead + never)


def dead_sources(days: int = 3, history_days: int = 30) -> tuple[list[str], list[str]]:
    """최근 days일 저장 0건인 소스를 둘로 나눈다 → (사망, 미개통).

    - **사망**: 최근 history_days 안에 저장한 적이 **있는데** 최근 days일은 0건.
      필메코·캐스트링크가 4개월 죽은 걸 모르고 지나간 사례가 이것이다. 실제 경보 대상.
    - **미개통**: 그 기간 내내 한 번도 저장이 없던 소스(신규·미구현·비수기).
      매 실행 경고에 섞이면 진짜 사망 신호가 묻힌다(2-4: "전부 실패" 판정이 무의미했던 이유와 같다).
    """
    today = date.today()
    since = (today - timedelta(days=days)).isoformat()
    since_hist = (today - timedelta(days=history_days)).isoformat()
    try:
        res = (supabase.table("crawl_logs").select("source_name,total_saved,run_date")
               .gte("run_date", since_hist).execute())
    except Exception:
        return [], []
    recent: dict[str, int] = defaultdict(int)
    older: dict[str, int] = defaultdict(int)
    for r in res.data or []:
        n = int(r.get("total_saved") or 0)
        if (r.get("run_date") or "") >= since:
            recent[r["source_name"]] += n
        else:
            older[r["source_name"]] += n
    zero = [s for s in set(recent) | set(older) if recent.get(s, 0) == 0]
    dead = sorted(s for s in zero if older.get(s, 0) > 0)
    never = sorted(s for s in zero if older.get(s, 0) == 0)
    return dead, never
