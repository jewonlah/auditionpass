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

# 페이지네이션 상수 — PostgREST 기본 상한(1,000행)에 걸리면 30일 창(~1,500행)에서
# 최신 행이 잘려 살아있는 소스 전부가 "사망"으로 오판된다(적대적 리뷰 2026-09).
_PAGE_SIZE = 1000
_SAFETY_LIMIT = 20000  # 무한 루프 방지용 안전 상한

# main.py의 scrapers 목록에서 뺀 소스는 여기에도 추가할 것.
# frontend/src/lib/admin/crawl-health.ts와 판정 규칙을 이중 유지한다(그쪽 상단 주석 참고) —
# 한쪽만 바뀌면 어드민 화면과 크롤러 경보 메일이 어긋난다.
RETIRED_SOURCES: frozenset[str] = frozenset({"V오디션"})


def _fetch_logs(since: str, select: str = "source_name,total_saved,run_date",
                 *, names: list[str] | None = None) -> list[dict]:
    """crawl_logs를 run_date 기준으로 페이지네이션해 since 이후 전량을 가져온다.

    .range()로 1,000행씩 순회 + 안전 상한 _SAFETY_LIMIT. id 컬럼이 있으면 2차 정렬에 써서
    페이지 경계에서 같은 run_date 행이 중복·누락되지 않게 하고, id 컬럼이 없는 스키마(009
    미적용 등)에서는 source_name으로 대체한다.
    """
    secondary_col = "id"
    out: list[dict] = []
    offset = 0
    while offset < _SAFETY_LIMIT:
        def _build(col: str):
            q = supabase.table("crawl_logs").select(select).gte("run_date", since)
            if names:
                q = q.in_("source_name", names)
            return q.order("run_date", desc=True).order(col).range(offset, offset + _PAGE_SIZE - 1)

        try:
            res = _build(secondary_col).execute()
        except Exception:
            if secondary_col != "source_name":
                secondary_col = "source_name"
                res = _build(secondary_col).execute()
            else:
                raise
        rows = res.data or []
        out.extend(rows)
        if len(rows) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE
    return out


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


def dead_sources(
    days: int = 3, history_days: int = 30, active_names: set[str] | None = None,
    retired_names: set[str] | None = None,
) -> tuple[list[str], list[str]]:
    """최근 days일 저장 0건인 소스를 둘로 나눈다 → (사망, 미개통).

    - **사망**: 최근 history_days 안에 저장한 적이 **있는데** 최근 days일은 0건.
      필메코·캐스트링크가 4개월 죽은 걸 모르고 지나간 사례가 이것이다. 실제 경보 대상.
    - **미개통**: 그 기간 내내 한 번도 저장이 없던 소스(신규·미구현·비수기).
      매 실행 경고에 섞이면 진짜 사망 신호가 묻힌다(2-4: "전부 실패" 판정이 무의미했던 이유와 같다).
    - active_names: 주어지면 이 집합 밖의 소스는 결과에서 제외한다(하위 호환). 조건부
      스크레이퍼(NAVER_CAFE_ENABLED)나 별도 실행 엔트리(run_social.ps1)는 "이번 실행에
      돌았는가"와 "살아있는가"가 다른 질문이라 main.py는 더는 이 값을 넘기지 않는다 —
      대신 retired_names로 명시적으로 뺀다(적대적 리뷰 2026-09).
    - retired_names: 이 집합의 소스는 사망/미개통 어느 쪽에도 넣지 않는다. 기본값은
      RETIRED_SOURCES(main.py 목록에서 완전히 뺀 소스, 예: V오디션).
    """
    today = date.today()
    since = (today - timedelta(days=days)).isoformat()
    since_hist = (today - timedelta(days=history_days)).isoformat()
    try:
        rows = _fetch_logs(since_hist, "source_name,total_saved,run_date")
    except Exception:
        return [], []
    recent: dict[str, int] = defaultdict(int)
    older: dict[str, int] = defaultdict(int)
    for r in rows:
        n = int(r.get("total_saved") or 0)
        if (r.get("run_date") or "") >= since:
            recent[r["source_name"]] += n
        else:
            older[r["source_name"]] += n
    zero = [s for s in set(recent) | set(older) if recent.get(s, 0) == 0]
    if active_names is not None:
        zero = [s for s in zero if s in active_names]
    exclude = RETIRED_SOURCES if retired_names is None else retired_names
    zero = [s for s in zero if s not in exclude]
    dead = sorted(s for s in zero if older.get(s, 0) > 0)
    never = sorted(s for s in zero if older.get(s, 0) == 0)
    return dead, never


def source_snapshot(names: list[str], days: int = 3, history_days: int = 30) -> dict[str, dict]:
    """소스별 마지막 저장일·최근 days일 수집 건수 — 사망 경보 메일 본문용(2-4 알림).

    dead_sources()의 반환 형태(list[str])는 기존 테스트 호환을 위해 그대로 두고,
    상세 통계가 필요한 alerts.py가 이 함수를 별도로 호출해 쓴다.
    """
    if not names:
        return {}
    today = date.today()
    since = (today - timedelta(days=days)).isoformat()
    since_hist = (today - timedelta(days=history_days)).isoformat()
    try:
        rows = _fetch_logs(
            since_hist, "source_name,total_saved,total_collected,run_date", names=list(names)
        )
    except Exception as e:
        logger.warning(f"crawl_logs 조회 실패(source_snapshot): {str(e)[:100]}")
        return {}
    out: dict[str, dict] = {}
    for r in rows:
        n = r.get("source_name")
        if not n:
            continue
        st = out.setdefault(n, {"last_saved_date": None, "recent_collected": 0})
        run_date = r.get("run_date") or ""
        if int(r.get("total_saved") or 0) > 0:
            if st["last_saved_date"] is None or run_date > st["last_saved_date"]:
                st["last_saved_date"] = run_date
        if run_date >= since:
            st["recent_collected"] += int(r.get("total_collected") or 0)
    return out
