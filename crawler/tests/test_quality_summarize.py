"""규칙 기반 요약·품질 점수 테스트 (2026-08-22, Anthropic API 대체)"""
import unittest
from datetime import date

from utils.quality import quality_score, source_trust
from utils.summarize import summarize


class SummarizeTest(unittest.TestCase):
    def test_label_bullets(self):
        text = """안녕하세요! 단편영화 <수집> 팀입니다.
모집 배역: 20대 남자 주연 1명
자격: 20~28세, 연기 경험 무관
촬영 일정: 9월 12일~14일 (3회차)
장소: 서울 마포구
페이: 회차당 15만원
지원 방법: 프로필을 cast@example.org 로 보내주세요
#단편영화 #배우모집 #오디션"""
        s = summarize(text)
        for k in ("배역", "자격", "일정", "장소", "페이", "지원"):
            self.assertIn(f"• {k}:", s, k)
        self.assertNotIn("#단편영화", s)
        self.assertNotIn("안녕하세요", s)

    def test_fallback_trim(self):
        text = "단편영화 배우를 찾습니다. " * 60
        s = summarize(text, max_chars=200)
        self.assertLessEqual(len(s), 201)
        self.assertTrue(s.endswith("…"))

    def test_empty(self):
        self.assertEqual(summarize(""), "")


class QualityTest(unittest.TestCase):
    def test_full_vs_minimal(self):
        hi = quality_score(apply_email="a@b.co", deadline=date(2026, 9, 1), description="x" * 300,
                           source_name="캐스틱", title="단편영화 <수집> 20대 남자 주연 모집 마감 임박", category_confidence=1.0)
        lo = quality_score(apply_email=None, deadline=None, description="짧음", source_name="네이버카페:어디",
                           title="모집", category_confidence=0.0)
        self.assertGreater(hi, 0.9)
        self.assertLess(lo, 0.15)

    def test_source_trust(self):
        self.assertEqual(source_trust("네이버카페:빛이 모이는 곳"), 0.6)
        self.assertEqual(source_trust("캐스틱"), 1.0)
        self.assertEqual(source_trust(None), 0.5)


if __name__ == "__main__":
    unittest.main()
