"""분류기 회귀 테스트 (2-1). 실행: crawler/ 에서 `python -m unittest discover tests`"""
import unittest

from utils.classifier import (
    CATEGORIES,
    ClassifyResult,
    _source_bias,
    classify_audition,
    classify_by_rule,
    to_legacy_genre,
)


class SourceBiasTest(unittest.TestCase):
    def test_korean_source_names(self):
        self.assertEqual(_source_bias("캐스팅114"), "actor")
        self.assertEqual(_source_bias("메가폰코리아"), "model")
        self.assertEqual(_source_bias("필메코"), "actor")

    def test_sns_prefix_and_corrupted(self):
        self.assertEqual(_source_bias("인스타그램:@some_account"), "actor")
        self.assertEqual(_source_bias("캐스팅나��"), "actor")  # 인코딩 손상 레코드

    def test_unknown(self):
        self.assertIsNone(_source_bias(""))
        self.assertIsNone(_source_bias("알수없음"))


class AgeRuleTest(unittest.TestCase):
    """'20~26세'의 '6세'가 키즈로 오탐되던 버그 회귀"""

    def test_adult_range_not_kids(self):
        for t in [
            "20~26세 여배우 모집",
            "만 27세 이하 남자 배우",
            "20대 초반 30세 까지",
            "15세 이상 관람가 영화 단역",
        ]:
            r = classify_audition(t, "", "캐스팅114")
            self.assertNotEqual(r.category, "키즈모델", t)

    def test_kids_range(self):
        for t in ["7~12세 아동 모델 모집", "만 5세 어린이 광고 촬영", "초등학생 배우 섭외", "영유아 모델"]:
            r = classify_audition(t, "", "메가폰코리아")
            self.assertEqual(r.category, "키즈모델", t)

    def test_generation_suffix(self):
        r = classify_audition("2세대 아이돌 연습생 모집", "", "")
        self.assertEqual(r.category, "아이돌")


class ClassifyTest(unittest.TestCase):
    def test_keyword_categories(self):
        cases = {
            "뮤지컬 앙상블 오디션": "뮤지컬",
            "대학로 연극 배우 모집": "연극",
            "쇼핑몰 피팅모델 구함": "촬영모델",
            "트로트 가수 오디션": "트로트",
            "보조출연 엑스트라 모집": "엑스트라",
            "웹드라마 주연 캐스팅": "배우",
        }
        for title, expected in cases.items():
            self.assertEqual(classify_audition(title, "", "").category, expected, title)

    def test_short_ascii_keyword_needs_word_boundary(self):
        # 실측 오탐: 'AIMC'의 'mc'가 MC/진행자로 잡힘
        r = classify_audition("[SNP아카데미] 배우 주현영 소속사 AIMC 내방 오디션", "", "캐스팅114")
        self.assertNotEqual(r.category, "MC/진행자")
        self.assertEqual(classify_audition("팝업스토어 MC를 모집합니다", "", "").category, "MC/진행자")

    def test_source_fallback_when_etc(self):
        r = classify_audition("아무 신호 없는 제목", "", "OTR")
        self.assertEqual((r.category, r.method, r.confidence), ("배우", "rule", 0.5))
        r2 = classify_audition("아무 신호 없는 제목", "", "")
        self.assertEqual((r2.category, r2.category_code), ("기타", "etc"))

    def test_rule_does_not_override_keyword_hit(self):
        base = ClassifyResult(category="뮤지컬", category_code="musical", confidence=1.0, method="keyword")
        self.assertEqual(classify_by_rule(base, "메가폰코리아", "뮤지컬", "").category, "뮤지컬")

    def test_legacy_genre_mapping_covers_all(self):
        for code in CATEGORIES:
            self.assertIn(to_legacy_genre(code), ("배우", "모델", "기타"))
        self.assertEqual(to_legacy_genre("etc"), "기타")


if __name__ == "__main__":
    unittest.main()
