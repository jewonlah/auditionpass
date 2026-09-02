# -*- coding: utf-8 -*-
"""utils.supabase_client 의 정제 게이트·위험 판정 입력 테스트 (2026-09-02 Opus/Codex 검수).

고정하는 결함 두 가지:
  ① 노출되지 않는 행(pending/quarantine)까지 DeepSeek으로 보내 선불 잔액을 태우던 것 — F8
  ② 위험 판정이 요약본만 보고 requirements는 아무도 보지 않던 것

네트워크 없이 돌아야 한다: DeepSeek 호출부(refine_description)를 mock으로 막고,
Supabase 클라이언트는 모듈 임포트 시점에만 생성되므로 더미 자격증명으로 세운다(요청은 하지 않는다).
"""

import os
import unittest
from unittest import mock

# 모듈 임포트 시 create_client()가 형식 검증을 하므로 형태만 맞는 더미 값을 먼저 넣는다.
# (.env가 있으면 load_dotenv는 기존 환경변수를 덮어쓰지 않는다 = 실제 키로 붙지 않는다)
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.test"
)

from utils import supabase_client as sc  # noqa: E402

LONG = "모집 배역: 20대 남자 주연\n" + ("서울에서 촬영하는 단편영화입니다. " * 30)


class RefineGateTest(unittest.TestCase):
    """긴 본문 정제 — LLM은 노출되는 행에만."""

    def setUp(self):
        # REFINE_ENABLED는 .env에 따라 달라진다. 게이트 자체를 보려면 켜 둔 상태로 고정한다.
        self._prev = sc.REFINE_ENABLED
        sc.REFINE_ENABLED = True

    def tearDown(self):
        sc.REFINE_ENABLED = self._prev

    def test_use_llm_false_does_not_call_api(self):
        with mock.patch.object(sc, "refine_description") as refine:
            out = sc._refine_if_needed(LONG, "단편영화 배우 모집", use_llm=False)
        refine.assert_not_called()
        self.assertNotEqual(out, LONG)  # 규칙 기반 summarize()가 압축했다
        self.assertTrue(out)

    def test_use_llm_true_calls_api(self):
        with mock.patch.object(sc, "refine_description", return_value="• 배역: 주연") as refine:
            out = sc._refine_if_needed(LONG, "단편영화 배우 모집", use_llm=True)
        refine.assert_called_once()
        self.assertEqual(out, "• 배역: 주연")

    def test_refine_disabled_falls_back_to_rules(self):
        sc.REFINE_ENABLED = False
        with mock.patch.object(sc, "refine_description") as refine:
            sc._refine_if_needed(LONG, "제목", use_llm=True)
        refine.assert_not_called()

    def test_short_description_untouched(self):
        short = "짧은 공고입니다."
        with mock.patch.object(sc, "refine_description") as refine:
            self.assertEqual(sc._refine_if_needed(short, "제목", use_llm=True), short)
        refine.assert_not_called()
        self.assertIsNone(sc._refine_if_needed(None, "제목", use_llm=True))


class ApplyRefineTest(unittest.TestCase):
    """정제가 본문을 바꿨을 때만 원문을 description_raw에 남긴다."""

    def test_auto_row_keeps_raw_and_uses_llm(self):
        data = {"description": LONG, "review_status": "auto"}
        with mock.patch.object(sc, "refine_description", return_value="• 배역: 주연") as refine, \
                mock.patch.object(sc, "description_raw_column_available", return_value=True):
            sc._apply_refine(data, "제목")
        refine.assert_called_once()
        self.assertEqual(data["description"], "• 배역: 주연")
        self.assertEqual(data["description_raw"], LONG)

    def test_pending_row_uses_rules_only(self):
        data = {"description": LONG, "review_status": "pending"}
        with mock.patch.object(sc, "refine_description") as refine, \
                mock.patch.object(sc, "description_raw_column_available", return_value=True):
            sc._apply_refine(data, "제목")
        refine.assert_not_called()
        self.assertEqual(data["description_raw"], LONG)

    def test_unchanged_description_stores_no_raw(self):
        data = {"description": "짧은 공고입니다.", "review_status": "auto"}
        with mock.patch.object(sc, "description_raw_column_available", return_value=True):
            sc._apply_refine(data, "제목")
        self.assertNotIn("description_raw", data)

    def test_column_missing_omits_key(self):
        """021 미적용 — 키를 아예 넣지 않는다(크롤러는 계속 돈다)."""
        data = {"description": LONG, "review_status": "pending"}
        with mock.patch.object(sc, "description_raw_column_available", return_value=False):
            sc._apply_refine(data, "제목")
        self.assertNotIn("description_raw", data)
        self.assertNotEqual(data["description"], LONG)


class WriteFallbackTest(unittest.TestCase):
    """컬럼 부재로 쓰기가 실패하면 그 키만 빼고 1회 재시도."""

    def setUp(self):
        self._prev = sc._description_raw_available

    def tearDown(self):
        sc._description_raw_available = self._prev

    def test_retries_without_raw_key(self):
        calls = []

        def write(payload):
            calls.append(dict(payload))
            if "description_raw" in payload:
                raise RuntimeError("column auditions.description_raw does not exist")
            return "ok"

        out = sc._write_with_raw_fallback(write, {"title": "t", "description_raw": "원문"})
        self.assertEqual(out, "ok")
        self.assertEqual(len(calls), 2)
        self.assertNotIn("description_raw", calls[1])
        self.assertIs(sc._description_raw_available, False)

    def test_other_errors_propagate(self):
        def write(payload):
            raise RuntimeError("duplicate key value violates unique constraint")

        with self.assertRaises(RuntimeError):
            sc._write_with_raw_fallback(write, {"title": "t", "description_raw": "원문"})


class RiskTextTest(unittest.TestCase):
    """위험 판정 입력 합치기 — 원문 우선 + requirements 포함."""

    def test_prefers_raw_over_summary(self):
        self.assertEqual(
            sc.risk_text("원문 참가비 20만원 입금", "• 배역: 주연", None),
            "원문 참가비 20만원 입금",
        )

    def test_falls_back_to_description(self):
        self.assertEqual(sc.risk_text(None, "요약본", None), "요약본")

    def test_includes_requirements(self):
        self.assertEqual(sc.risk_text(None, "본문", "신분증 사본"), "본문\n신분증 사본")

    def test_requirements_only(self):
        self.assertEqual(sc.risk_text(None, None, "신분증 사본"), "신분증 사본")

    def test_all_empty_is_none(self):
        self.assertIsNone(sc.risk_text(None, None, None))
        self.assertIsNone(sc.risk_text("", "", ""))

    def test_requirements_only_scam_is_detected(self):
        """요약본은 멀쩡한데 자격 요건 칸에 징수가 적힌 공고 — 예전엔 통과했다."""
        from utils.risk import risk_score

        summary = "• 배역: 신인 배우\n• 지원: 이메일"
        requirements = "참가비 20만원을 선입금해 주세요."
        self.assertLess(risk_score("배우 모집", summary)[0], 4)
        score, reasons = risk_score("배우 모집", sc.risk_text(None, summary, requirements))
        self.assertGreaterEqual(score, 4)
        self.assertIn("비용 징수 문맥", reasons)


if __name__ == "__main__":
    unittest.main()
