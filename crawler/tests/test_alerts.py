# -*- coding: utf-8 -*-
"""소스 사망 경보 메일 발송 테스트 (플랜 30 §2 2-4 마무리).

네트워크 없음 — requests.post와 crawl_log의 supabase 호출을 모두 mock한다.
"""

import json
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest import mock

from utils import alerts, crawl_log


class _Res:
    def __init__(self, data):
        self.data = data


def _patch_snapshot(rows):
    """crawl_log.source_snapshot이 참조하는 supabase.table(...) 체인을 흉내낸다."""
    chain = mock.MagicMock()
    chain.select.return_value = chain
    chain.in_.return_value = chain
    chain.gte.return_value = chain
    chain.order.return_value = chain
    chain.range.return_value = chain
    chain.execute.return_value = _Res(rows)
    table = mock.MagicMock(return_value=chain)
    return mock.patch.object(crawl_log.supabase, "table", table)


class TestNotifyDeadSources(unittest.TestCase):
    def setUp(self):
        self._env_patch = mock.patch.dict(
            "os.environ",
            {"RESEND_API_KEY": "test-key", "ALERT_EMAIL": "a@auditionpass.co.kr"},
        )
        self._env_patch.start()
        self._tmpdir = tempfile.TemporaryDirectory()
        self.state_path = Path(self._tmpdir.name) / "alert_state.json"

    def tearDown(self):
        self._env_patch.stop()
        self._tmpdir.cleanup()

    def test_no_env_no_send(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            with mock.patch("utils.alerts.requests.post") as mock_post:
                ok = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertFalse(ok)
        mock_post.assert_not_called()

    def test_dead_triggers_single_send_with_source_name(self):
        with _patch_snapshot([]):
            with mock.patch("utils.alerts.requests.post") as mock_post:
                mock_post.return_value = mock.Mock(status_code=200, text="ok")
                ok = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertTrue(ok)
        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        self.assertIn("필메코", kwargs["json"]["text"])
        self.assertEqual(kwargs["json"]["from"], "alerts@auditionpass.co.kr")
        self.assertTrue(self.state_path.exists())

    def test_second_call_within_24h_is_suppressed(self):
        with _patch_snapshot([]):
            with mock.patch("utils.alerts.requests.post") as mock_post:
                mock_post.return_value = mock.Mock(status_code=200, text="ok")
                first = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
                second = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(mock_post.call_count, 1)

    def test_never_only_does_not_send(self):
        with mock.patch("utils.alerts.requests.post") as mock_post:
            ok = alerts.notify_dead_sources([], ["플레이DB"], state_path=self.state_path)
        self.assertFalse(ok)
        mock_post.assert_not_called()

    def test_requests_exception_returns_false_no_raise(self):
        with _patch_snapshot([]):
            with mock.patch("utils.alerts.requests.post", side_effect=RuntimeError("network down")):
                ok = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertFalse(ok)

    def test_suppression_expires_after_24h(self):
        stale = (datetime.now(alerts._KST) - timedelta(hours=25)).isoformat()
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps({"필메코": stale}), encoding="utf-8")
        with _patch_snapshot([]):
            with mock.patch("utils.alerts.requests.post") as mock_post:
                mock_post.return_value = mock.Mock(status_code=200, text="ok")
                ok = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertTrue(ok)
        mock_post.assert_called_once()

    def test_empty_alert_from_falls_back_to_default(self):
        # .env.example의 `ALERT_FROM=`처럼 키는 있는데 값이 빈 문자열이면
        # os.environ.get(k, default)가 ""를 돌려줘 Resend 422로 메일이 영영 안 나갔다.
        with mock.patch.dict("os.environ", {"ALERT_FROM": ""}):
            with _patch_snapshot([]):
                with mock.patch("utils.alerts.requests.post") as mock_post:
                    mock_post.return_value = mock.Mock(status_code=200, text="ok")
                    ok = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertTrue(ok)
        _, kwargs = mock_post.call_args
        self.assertEqual(kwargs["json"]["from"], "alerts@auditionpass.co.kr")

    def test_naive_datetime_state_is_still_suppressed(self):
        # naive datetime(타임존 없음) state는 tz-aware now와 빼면 TypeError가 나서
        # 억제 판단 자체가 무력화됐다 — UTC로 간주해 정상 억제돼야 한다.
        naive_recent = datetime.utcnow().isoformat()  # 타임존 정보 없음
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps({"필메코": naive_recent}), encoding="utf-8")
        with _patch_snapshot([]):
            with mock.patch("utils.alerts.requests.post") as mock_post:
                ok = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertFalse(ok)
        mock_post.assert_not_called()

    def test_corrupt_state_value_fails_open_and_sends(self):
        # 파싱 자체가 실패하는 손상된 값은 억제하지 않고 발송 대상에 넣는다(침묵보다 중복이 낫다).
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps({"필메코": "not-a-timestamp"}), encoding="utf-8")
        with _patch_snapshot([]):
            with mock.patch("utils.alerts.requests.post") as mock_post:
                mock_post.return_value = mock.Mock(status_code=200, text="ok")
                with self.assertLogs("utils.alerts", level="WARNING") as cm:
                    ok = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertTrue(ok)
        self.assertTrue(any("파싱 실패" in line for line in cm.output))

    def test_state_pruned_after_30_days(self):
        old = (datetime.now(alerts._KST) - timedelta(days=31)).isoformat()
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps({"오래된소스": old}), encoding="utf-8")
        with _patch_snapshot([]):
            with mock.patch("utils.alerts.requests.post") as mock_post:
                mock_post.return_value = mock.Mock(status_code=200, text="ok")
                alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        saved_state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertNotIn("오래된소스", saved_state)
        self.assertIn("필메코", saved_state)

    def test_exception_message_redacts_api_key(self):
        with mock.patch.dict("os.environ", {"RESEND_API_KEY": "sk-super-secret-123"}):
            with _patch_snapshot([]):
                with mock.patch(
                    "utils.alerts.requests.post",
                    side_effect=ValueError("bad header value: Bearer sk-super-secret-123"),
                ):
                    with self.assertLogs("utils.alerts", level="WARNING") as cm:
                        ok = alerts.notify_dead_sources(["필메코"], [], state_path=self.state_path)
        self.assertFalse(ok)
        joined = "\n".join(cm.output)
        self.assertNotIn("sk-super-secret-123", joined)
        self.assertIn("***", joined)


class TestDeadSourcesActiveNamesFilter(unittest.TestCase):
    """dead_sources의 active_names 필터 — main.py 목록에서 빠진 소스는 결과에서 제외."""

    def _rows(self, spec):
        out = []
        for src, days_ago, saved in spec:
            out.append({
                "source_name": src,
                "total_saved": saved,
                "run_date": (date.today() - timedelta(days=days_ago)).isoformat(),
            })
        return out

    def _patch(self, rows):
        chain = mock.MagicMock()
        chain.select.return_value = chain
        chain.gte.return_value = chain
        chain.order.return_value = chain
        chain.range.return_value = chain
        chain.execute.return_value = _Res(rows)
        table = mock.MagicMock(return_value=chain)
        return mock.patch.object(crawl_log.supabase, "table", table)

    def test_inactive_source_excluded_from_dead_and_never(self):
        rows = self._rows([
            ("필메코", 10, 40),
            ("필메코", 1, 0),      # 사망 후보
            ("V오디션", 10, 20),
            ("V오디션", 1, 0),     # main.py 목록에서 빠짐 — active_names 밖
            ("플레이DB", 10, 0),
            ("플레이DB", 1, 0),    # 미개통 후보, 역시 active_names 밖
        ])
        active = {"필메코"}
        with self._patch(rows):
            dead, never = crawl_log.dead_sources(days=3, active_names=active)
        self.assertEqual(dead, ["필메코"])
        self.assertEqual(never, [])


if __name__ == "__main__":
    unittest.main()
