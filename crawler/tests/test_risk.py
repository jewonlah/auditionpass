# -*- coding: utf-8 -*-
"""utils.risk 위험 점수 v0 테스트 (플랜 37 auto-triage)."""

import unittest

from utils.risk import risk_score


class TestRiskScore(unittest.TestCase):
    def test_fee_required_quarantine(self):
        s, reasons = risk_score(
            "신인 배우 모집",
            "프로필 촬영비 20만원 본인 부담입니다. 등록비 입금 후 오디션 진행. 프로필 사진 이메일 지원",
        )
        self.assertGreaterEqual(s, 7)
        self.assertIn("비용 징수 문맥", reasons)

    def test_fee_negated_ok(self):
        s, reasons = risk_score(
            "단편영화 배우 모집",
            "참가비 없음. 제작사 스튜디오온 제작. 프로필과 연기영상을 이메일로 보내주세요. 출연료 회차당 10만원",
        )
        self.assertLess(s, 4)
        self.assertNotIn("비용 징수 문맥", reasons)

    def test_unpaid_commercial(self):
        s, reasons = risk_score(
            "브랜드 홍보 영상 모델 모집",
            "무급이지만 좋은 경험이 될 거예요. 광고 영상에 사용됩니다. 프로필, 사진, 연락처 보내주세요",
        )
        self.assertGreaterEqual(s, 5)
        self.assertIn("무급+상업 사용(착취 의심)", reasons)

    def test_debut_guarantee(self):
        s, reasons = risk_score("아이돌 연습생 모집", "데뷔 보장! 100% 데뷔 가능. 텔레그램으로 연락주세요")
        self.assertGreaterEqual(s, 5)
        self.assertIn("과장 보상(데뷔·합격 보장)", reasons)

    def test_identity_request(self):
        s, reasons = risk_score("모델 모집", "지원 시 신분증 사본과 통장 사본을 보내주세요")
        self.assertGreaterEqual(s, 4)
        self.assertIn("신분증·금융정보 요구", reasons)

    def test_normal_posting_zero(self):
        s, _ = risk_score(
            "단편영화 <여름끝> 주연 배우 모집",
            "한국예술대학교 졸업작품 제작팀입니다. 감독 김OO. 촬영 9월 서울. 출연료 회차당 10만원. "
            "프로필과 연기 영상을 이메일로 접수해 주세요. 마감 9월 5일",
        )
        self.assertLess(s, 4)

    def test_info_asymmetry(self):
        s, reasons = risk_score(
            "출연자 모집",
            "프로필, 전신 사진, 연기 영상, 연락처를 보내주세요. 자세한 내용은 합격자에게 개별 안내",
        )
        self.assertGreaterEqual(s, 2)
        self.assertIn("정보 비대칭(주체 불명+요구 과다)", reasons)


if __name__ == "__main__":
    unittest.main()
