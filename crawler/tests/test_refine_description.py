# -*- coding: utf-8 -*-
"""utils.refine_description 서킷 브레이커·출력 검증 테스트, 그리고
tools.enrich_deepseek / tools.classify_candidates의 행 조립 함수(id 덮어쓰기 방지) 테스트.

네트워크 호출 없음 — DeepSeek 클라이언트는 전부 mock으로 대체한다.
"""

import os
import unittest
from unittest.mock import MagicMock, patch

from utils import refine_description as rd


def _mock_response(content):
    resp = MagicMock()
    resp.choices = [MagicMock(message=MagicMock(content=content))]
    return resp


RAW = "모집 배역: 20대 남자 주연 1명\n자격: 20~28세, 연기 경험 무관\n촬영 일정: 9월 12일~14일\n지원 방법: 이메일 접수"


class RefineDescriptionTest(unittest.TestCase):
    def setUp(self):
        rd.reset_run_state()
        os.environ.pop("REFINE_MAX_CALLS", None)

    def tearDown(self):
        rd.reset_run_state()
        os.environ.pop("REFINE_MAX_CALLS", None)

    def test_normal_response_returns_refined(self):
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_response(
            "• 배역: 20대 남자 주연 1명\n• 자격: 20~28세\n• 지원방법: 이메일 접수"
        )
        with patch.object(rd, "_get_client", return_value=mock_client):
            result = rd.refine_description(RAW, "단편영화 배우 모집")
        self.assertIn("배역", result)
        mock_client.chat.completions.create.assert_called_once()

    def test_empty_response_falls_back_to_summarize(self):
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_response("")
        with patch.object(rd, "_get_client", return_value=mock_client):
            result = rd.refine_description(RAW, "단편영화 배우 모집")
        # summarize()는 라벨 bullet을 뽑아낸다 — API 폴백 결과인지 확인
        self.assertIn("배역", result)

    def test_script_output_is_rejected_and_falls_back(self):
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_response(
            "<script>alert(1)</script>"
        )
        with patch.object(rd, "_get_client", return_value=mock_client):
            result = rd.refine_description(RAW, "단편영화 배우 모집")
        self.assertNotIn("<script>", result)
        self.assertNotIn("<", result)

    def test_circuit_breaker_stops_calling_api_after_3_failures(self):
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = Exception("boom")
        with patch.object(rd, "_get_client", return_value=mock_client):
            for _ in range(3):
                rd.refine_description(RAW, "테스트 공고")
            self.assertEqual(mock_client.chat.completions.create.call_count, 3)

            # 4번째 호출은 연속 실패 3회를 넘겨 API를 부르지 않고 바로 폴백해야 한다
            result = rd.refine_description(RAW, "테스트 공고")
            self.assertEqual(mock_client.chat.completions.create.call_count, 3)
            self.assertIn("배역", result)

    def test_max_calls_budget_stops_calling_api(self):
        os.environ["REFINE_MAX_CALLS"] = "2"
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_response(
            "• 배역: 정상적으로 정제된 한글 결과 텍스트입니다"
        )
        with patch.object(rd, "_get_client", return_value=mock_client):
            rd.refine_description(RAW, "테스트 공고")
            rd.refine_description(RAW, "테스트 공고")
            self.assertEqual(mock_client.chat.completions.create.call_count, 2)

            # 상한(2회) 초과 — 3번째는 API 호출 없이 폴백
            result = rd.refine_description(RAW, "테스트 공고")
            self.assertEqual(mock_client.chat.completions.create.call_count, 2)
            self.assertIn("배역", result)

    def test_long_output_truncated_at_line_boundary(self):
        lines = [f"• 항목{i}: 정상적인 한글 내용입니다" for i in range(60)]
        long_text = "\n".join(lines)
        self.assertGreater(len(long_text), 600)

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_response(long_text)
        with patch.object(rd, "_get_client", return_value=mock_client):
            result = rd.refine_description(RAW, "테스트 공고")

        self.assertLessEqual(len(result), 600)
        self.assertTrue(result.endswith("..."))
        body = result[: -len("...")]
        last_line = body.rstrip("\n").split("\n")[-1]
        # 줄 경계에서 잘렸다면 마지막 줄은 온전한 "• 항목N: ..." 형태여야 한다(중간에서 끊기지 않음)
        self.assertRegex(last_line, r"^• 항목\d+: 정상적인 한글 내용입니다$")


class EnrichRowAssemblyTest(unittest.TestCase):
    """tools.enrich_deepseek.build_output_row — 모델 dict가 고정 필드를 덮어쓰지 못함을 확인."""

    def test_model_id_does_not_override_fixed_id(self):
        from tools.enrich_deepseek import build_output_row

        row = {"id": "real-id-1", "title": "진짜 제목", "source_name": "진짜소스"}
        d = {"id": "가짜-id", "apply_email": "cast@example.com", "category": "배우"}
        out = build_output_row(row, d)
        self.assertEqual(out["id"], "real-id-1")
        self.assertEqual(out["title"], "진짜 제목")
        self.assertEqual(out["source_name"], "진짜소스")
        self.assertEqual(out["apply_email"], "cast@example.com")

    def test_no_id_in_model_dict_still_works(self):
        from tools.enrich_deepseek import build_output_row

        row = {"id": "real-id-2", "title": "제목", "source_name": "소스"}
        d = {"category": "모델"}
        out = build_output_row(row, d)
        self.assertEqual(out["id"], "real-id-2")
        self.assertEqual(out["category"], "모델")


class ClassifyRowAssemblyTest(unittest.TestCase):
    """tools.classify_candidates.build_output_row — 모델 dict가 고정 필드를 덮어쓰지 못함을 확인."""

    def test_model_id_does_not_override_fixed_id(self):
        from tools.classify_candidates import build_output_row

        r = {"id": "cand-1", "url": "https://real.example.com", "kind": "domain",
             "hits": 5, "sample_title": "샘플", "found_by": "네이버카페"}
        d = {"id": "가짜-id", "url": "https://fake.example.com", "verdict": "approve"}
        out = build_output_row(r, d)
        self.assertEqual(out["id"], "cand-1")
        self.assertEqual(out["url"], "https://real.example.com")
        self.assertEqual(out["verdict"], "approve")

    def test_no_id_in_model_dict_still_works(self):
        from tools.classify_candidates import build_output_row

        r = {"id": "cand-2", "url": "https://real2.example.com", "kind": "account",
             "hits": 1, "sample_title": "샘플2", "found_by": "인스타"}
        d = {"verdict": "reject", "risk": "low"}
        out = build_output_row(r, d)
        self.assertEqual(out["id"], "cand-2")
        self.assertEqual(out["verdict"], "reject")


if __name__ == "__main__":
    unittest.main()
