# -*- coding: utf-8 -*-
"""소스 사망 판정 테스트 (플랜 30 §2 2-4).

핵심: **사망(살아있다가 멈춤)과 미개통(원래 0건)을 섞지 않는다.**
섞으면 매 실행 경고가 10줄씩 나오고 진짜 사망 신호가 그 안에 묻힌다 —
필메코·캐스트링크가 4개월 죽은 걸 모르고 지나간 게 그래서였다.
"""

import unittest
from datetime import date, timedelta
from unittest import mock

from utils import crawl_log


def _rows(spec):
    """spec: [(source, days_ago, saved), ...] → crawl_logs 응답 형태"""
    out = []
    for src, days_ago, saved in spec:
        out.append({
            "source_name": src,
            "total_saved": saved,
            "run_date": (date.today() - timedelta(days=days_ago)).isoformat(),
        })
    return out


class _Res:
    def __init__(self, data):
        self.data = data


def _patch(rows):
    """supabase.table(...).select(...).gte(...).order(...).order(...).range(...).execute() 체인을 흉내낸다.
    (_fetch_logs의 페이지네이션 체인 — 1페이지에 다 들어가는 소량 데이터는 단일 execute()로 충분.)"""
    chain = mock.MagicMock()
    chain.select.return_value = chain
    chain.gte.return_value = chain
    chain.in_.return_value = chain
    chain.order.return_value = chain
    chain.range.return_value = chain
    chain.execute.return_value = _Res(rows)
    table = mock.MagicMock(return_value=chain)
    return mock.patch.object(crawl_log.supabase, "table", table)


class TestDeadSources(unittest.TestCase):
    def test_dead_vs_never(self):
        rows = _rows([
            ("필메코", 10, 40),   # 예전엔 저장했고
            ("필메코", 1, 0),     # 최근 3일은 0 → 사망
            ("플레이DB", 10, 0),  # 내내 0 → 미개통
            ("플레이DB", 1, 0),
            ("캐스틱", 1, 5),     # 최근에도 저장 → 정상
        ])
        with _patch(rows):
            dead, never = crawl_log.dead_sources(days=3)
        self.assertEqual(dead, ["필메코"])
        self.assertEqual(never, ["플레이DB"])

    def test_recent_save_is_not_dead(self):
        rows = _rows([("캐스틱", 10, 3), ("캐스틱", 0, 1)])
        with _patch(rows):
            dead, never = crawl_log.dead_sources(days=3)
        self.assertEqual((dead, never), ([], []))

    def test_wrapper_merges_both(self):
        rows = _rows([("필메코", 10, 40), ("필메코", 1, 0), ("플레이DB", 5, 0)])
        with _patch(rows):
            self.assertEqual(crawl_log.recent_zero_days(days=3), ["플레이DB", "필메코"])

    def test_query_failure_is_not_fatal(self):
        # crawl_logs 미적용 환경에서 크롤러가 멈추면 안 된다
        chain = mock.MagicMock()
        chain.select.side_effect = RuntimeError("relation crawl_logs does not exist")
        with mock.patch.object(crawl_log.supabase, "table", mock.MagicMock(return_value=chain)):
            self.assertEqual(crawl_log.dead_sources(), ([], []))

    def test_retired_source_excluded_by_default(self):
        # V오디션은 main.py 목록에서 완전히 뺀 소스 — RETIRED_SOURCES 기본값으로 늘 제외돼야 한다.
        rows = _rows([
            ("V오디션", 10, 20),
            ("V오디션", 1, 0),     # 저장 이력은 있지만 퇴역 소스라 사망 목록에 넣지 않는다
            ("필메코", 10, 40),
            ("필메코", 1, 0),      # 진짜 사망
        ])
        with _patch(rows):
            dead, never = crawl_log.dead_sources(days=3)
        self.assertEqual(dead, ["필메코"])
        self.assertNotIn("V오디션", dead)
        self.assertNotIn("V오디션", never)

    def test_retired_names_override(self):
        rows = _rows([("필메코", 10, 40), ("필메코", 1, 0)])
        with _patch(rows):
            dead, never = crawl_log.dead_sources(days=3, retired_names={"필메코"})
        self.assertEqual((dead, never), ([], []))


class TestFetchLogsPagination(unittest.TestCase):
    """PostgREST 기본 상한(1,000행)에 걸려 30일 창이 잘리는 사고 방지 회귀 테스트."""

    def test_fetch_logs_paginates_beyond_1000_rows(self):
        today = date.today().isoformat()
        page1 = [
            {"source_name": f"소스{i}", "total_saved": 1, "run_date": today}
            for i in range(1000)
        ]
        page2 = [
            {"source_name": f"소스{i}", "total_saved": 1, "run_date": today}
            for i in range(1000, 1200)
        ]
        chain = mock.MagicMock()
        chain.select.return_value = chain
        chain.gte.return_value = chain
        chain.order.return_value = chain
        chain.range.return_value = chain
        chain.execute.side_effect = [_Res(page1), _Res(page2)]
        table = mock.MagicMock(return_value=chain)
        with mock.patch.object(crawl_log.supabase, "table", table):
            rows = crawl_log._fetch_logs(today)
        self.assertEqual(len(rows), 1200)
        self.assertEqual(chain.execute.call_count, 2)

    def test_fetch_logs_falls_back_to_source_name_order_when_id_missing(self):
        # id 컬럼이 없는 스키마(009 미적용)에서는 첫 시도가 실패하고 source_name 2차 정렬로 재시도한다.
        today = date.today().isoformat()
        rows = [{"source_name": "필메코", "total_saved": 1, "run_date": today}]
        chain = mock.MagicMock()
        chain.select.return_value = chain
        chain.gte.return_value = chain
        chain.range.return_value = chain

        calls = {"n": 0}

        def _order(*args, **kwargs):
            calls["n"] += 1
            # 1차 시도의 두 번째 .order(secondary_col) 호출("id")에서만 실패시킨다.
            if calls["n"] == 2 and args and args[0] == "id":
                raise RuntimeError('column "id" does not exist')
            return chain

        chain.order.side_effect = _order
        chain.execute.return_value = _Res(rows)
        table = mock.MagicMock(return_value=chain)
        with mock.patch.object(crawl_log.supabase, "table", table):
            out = crawl_log._fetch_logs(today)
        self.assertEqual(out, rows)


if __name__ == "__main__":
    unittest.main()
