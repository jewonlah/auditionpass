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
    """supabase.table(...).select(...).gte(...).execute() 체인을 흉내낸다."""
    chain = mock.MagicMock()
    chain.select.return_value = chain
    chain.gte.return_value = chain
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


if __name__ == "__main__":
    unittest.main()
