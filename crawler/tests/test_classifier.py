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


class LeadingTagTest(unittest.TestCase):
    """제목 맨 앞 [분류명] 태그가 다른 키워드보다 우선해야 한다 (아이돌 오분류 회귀)"""

    def test_tag_wins_over_body_keywords(self):
        cases = {
            "[뮤지컬]k-pop가족뮤지컬 <어린왕자> 배우 오디션": "뮤지컬",
            "[연극]대구 동성로 연극 <봄날은 간다> 배우 모집": "연극",
            "[가수][NEXT BEAT] 가창자 모집": "가수",
            "[댄스]넌버벌 퍼포먼스 <K-POP ON STAGE>": "댄서",
        }
        for title, expected in cases.items():
            r = classify_audition(title, "", "")
            self.assertEqual(r.category, expected, title)
            self.assertEqual(r.method, "rule", title)
            self.assertEqual(r.confidence, 0.95, title)

    def test_non_category_tag_falls_back_to_existing_logic(self):
        # 태그가 분류명이 아니면 무시하고 기존 로직 유지 — 이 두 제목은 태그 규칙 범위 밖.
        r1 = classify_audition("남자 아이돌 멤버 모집합니다.", "", "")
        self.assertEqual(r1.category, "아이돌")
        r2 = classify_audition("JTBC 아이돌 오디션 《PROJECT 7》", "", "")
        self.assertEqual(r2.category, "아이돌")


if __name__ == "__main__":
    unittest.main()
