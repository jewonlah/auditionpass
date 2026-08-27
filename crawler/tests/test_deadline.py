# -*- coding: utf-8 -*-
"""마감일 파싱 테스트 (플랜 30 §2 2-3).

기준: **틀린 마감일이 마감 미상보다 나쁘다.** 마감 미상은 45일 만료로 자동 정리되지만,
촬영일을 마감으로 저장하면 끝난 공고가 미래 마감으로 계속 노출돼 유저가 헛지원한다.
"""

import unittest
from datetime import date

from scrapers.base import BaseScraper
from sns_sources.instagram_caption import _extract_deadline


class TestParseDeadlineSmart(unittest.TestCase):
    def test_range_takes_end_date(self):
        s = "모집기간 2026.09.01 ~ 2026.09.30 까지 접수합니다"
        self.assertEqual(BaseScraper.parse_deadline_smart(s), date(2026, 9, 30))

    def test_label_near_date(self):
        s = "촬영은 여름 예정입니다.\n접수 마감 2026.10.15\n문의 주세요"
        self.assertEqual(BaseScraper.parse_deadline_smart(s), date(2026, 10, 15))

    def test_date_before_kkaji(self):
        self.assertEqual(BaseScraper.parse_deadline_smart("2026.11.20 까지 지원"), date(2026, 11, 20))

    def test_phone_not_parsed_as_date(self):
        self.assertIsNone(BaseScraper.parse_deadline_smart("문의 010-1234-5678", require_label=True))

    def test_require_label_drops_bare_date(self):
        # 본문 첫 날짜가 촬영일인 전형적 케이스 — 라벨이 없으면 마감으로 쓰지 않는다
        s = "시니어 모델 구인합니다. 촬영일자 2027.07.16 예상. 1명 모집"
        self.assertIsNone(BaseScraper.parse_deadline_smart(s, require_label=True))

    def test_without_require_label_keeps_old_behavior(self):
        # 명시적 마감 필드를 넘길 때는 라벨이 없어도 값을 써야 한다
        self.assertEqual(BaseScraper.parse_deadline_smart("2026.09.20"), date(2026, 9, 20))


class TestSnsExtractDeadline(unittest.TestCase):
    def test_shooting_date_not_deadline(self):
        # 옛 구현은 맥락 없이 max()를 골라 촬영일을 마감으로 저장했다(활성 공고에 2027년 마감이 생긴 원인)
        cap = "시니어 모델 구인합니다. 촬영일자 : 2027.07.16 1회차 예상. 1명 모집"
        self.assertIsNone(_extract_deadline(cap, date(2026, 8, 27)))

    def test_release_date_not_deadline(self):
        cap = "영화 <살인자의 리포트>가 2026.09.05 개봉했습니다. 배우 모집"
        self.assertIsNone(_extract_deadline(cap, date(2026, 8, 27)))

    def test_deadline_label_kept(self):
        cap = "배우 모집\n접수 마감 : 2026.09.30\n촬영 2026.10.20 예정"
        self.assertEqual(_extract_deadline(cap, date(2026, 8, 27)), date(2026, 9, 30))

    def test_range_kept(self):
        cap = "모집기간 2026.09.01 ~ 2026.09.20 배우 모집합니다"
        self.assertEqual(_extract_deadline(cap, date(2026, 8, 27)), date(2026, 9, 20))

    def test_md_with_context_still_works(self):
        cap = "배우 모집합니다. 9월 15일까지 접수받습니다"
        self.assertEqual(_extract_deadline(cap, date(2026, 8, 27)), date(2026, 9, 15))

    def test_no_date(self):
        self.assertIsNone(_extract_deadline("상시 모집합니다", date(2026, 8, 27)))

    def test_inexact_posted_at_drops_far_future_md(self):
        # 카페·웹문서 검색은 게시일을 안 주고 과거 글도 잡아온다. 크롤 당일(8월) 기준으로
        # "6월"을 내년으로 밀면 마감 지난 글이 미래 마감이 된다(실측 377건의 원인).
        cap = "배우 모집합니다. 모집 마감일 ~6월 1일 까지"
        self.assertIsNone(_extract_deadline(cap, date(2026, 8, 27), posted_at_exact=False))

    def test_inexact_posted_at_keeps_near_future_md(self):
        # 반년 안쪽이면 보정을 그대로 쓴다
        cap = "배우 모집합니다. 9월 15일까지 접수"
        self.assertEqual(_extract_deadline(cap, date(2026, 8, 27), posted_at_exact=False),
                         date(2026, 9, 15))

    def test_exact_posted_at_still_rolls_over(self):
        # 인스타는 실제 게시일을 알므로 연도 보정을 그대로 신뢰한다
        cap = "배우 모집합니다. 1월 10일까지 접수"
        self.assertEqual(_extract_deadline(cap, date(2026, 12, 1), posted_at_exact=True),
                         date(2027, 1, 10))


if __name__ == "__main__":
    unittest.main()
