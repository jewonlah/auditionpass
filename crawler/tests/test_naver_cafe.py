"""네이버 카페 소싱 필터 회귀 테스트 (트랙 A-1). 네트워크 없음."""
import unittest

from sns_sources.naver_cafe import CafeItem, _clean_title, _short_cafe, is_candidate, to_audition


def item(title, desc="단편영화 배우를 모집합니다. 지원은 이메일로 부탁드립니다. 촬영은 9월 중순입니다.", cafe="빛이 모이는 곳 [ SPOTLIGHT ] - 아역배우 이루은"):
    return CafeItem(title=title, description=desc, link="https://cafe.naver.com/x/1", cafename=cafe, cafeurl="", keyword="t")


class FilterTest(unittest.TestCase):
    def test_pass_typical_posts(self):
        for t in [
            "[KAFA] 한국영화아카데미 졸업작품 단편영화 배우님들 모집합니다.",
            "단편영화 <수집>에서 주연배우를 구합니다.",
            "2026 연극 《침묵의 고백》 배우 모집 공고",
            "경남 진주 지원사업 단편영화 아역 모집합니다.",
        ]:
            ok, reason = is_candidate(item(t))
            self.assertTrue(ok, f"{t} → {reason}")

    def test_reject_beauty_model_cafe(self):
        ok, reason = is_candidate(item("헤어라인 문신 모델 모집", "압구정 시술 모델 배우 인플루언서", cafe="모델나라 ★ 피팅모델구인구직"))
        self.assertEqual((ok, reason), (False, "cafe_blacklist"))

    def test_reject_procedure_and_news(self):
        self.assertEqual(is_candidate(item("눈썹 반영구 모델 모집", "반영구 시술 모델 배우 모집", cafe="자유카페"))[1], "negative")
        self.assertEqual(is_candidate(item("[코엔아] 단편영화 <먼 후일> 캐스팅 소식", "캐스팅 소식입니다 배우 모집 후 확정"))[1], "news")
        self.assertEqual(is_candidate(item("04/24 [단편/독립/기타영화] 배우모집(오디션) - [필름메이커스 자료 정리]", "배우모집 오디션 정리 글 모음입니다 자료 정리"))[1], "news")
        self.assertEqual(is_candidate(item('단편영화 "기캅니까?" 캐스팅 배우 박상민', "소속 배우 박상민이 단편영화에 캐스팅 되었습니다"))[1], "news")

    def test_body_mentions_of_casting_status_are_fine(self):
        # "캐스팅 완료 시 조기마감", "캐스팅 확정 후 협의"는 정상 공고 문구 (실측 오제외 회귀)
        self.assertTrue(is_candidate(item("단편영화 <유학생> 배우 모집", "지원 순으로 검토하며 캐스팅 완료 시 조기마감될 수 있습니다. 중국어 필요 역 포함"))[0])
        self.assertTrue(is_candidate(item("단편 애니메이션 더빙 배우 모집", "촬영기간 캐스팅 확정 후 협의 / 녹음 1회 예정. 영화진흥위원회 지원작"))[0])

    def test_reject_offtopic(self):
        self.assertEqual(is_candidate(item("대덕특구 청소년 오케스트라 신규단원 오디션 공고", "초등 4학년부터 가능 오케스트라 단원 모집 합주"))[1], "negative")
        self.assertEqual(is_candidate(item("창업진흥원 공고 AI 솔루션 공급기업 모집", "국가 차원의 창업 오디션 모두의 창업 프로젝트 공급기업"))[1], "negative")
        self.assertEqual(is_candidate(item("오늘 점심 뭐 먹지", "회사 근처 맛집 추천 부탁드려요 분위기 좋은 곳으로"))[1], "no_signal")


class TitleTest(unittest.TestCase):
    def test_board_prefix(self):
        self.assertEqual(_clean_title("단편영화단편영화<수집>에서 주연배우를 구합니다."), "[단편영화] <수집>에서 주연배우를 구합니다.")
        self.assertEqual(_clean_title("단편영화KAFA 43기 졸업작품 [VORTEX]"), "[단편영화] KAFA 43기 졸업작품 [VORTEX]")
        self.assertEqual(_clean_title("단편영화 <유학생> 배우 모집"), "단편영화 <유학생> 배우 모집")
        self.assertEqual(_clean_title("<b>웹드라마</b> 오디션 &amp; 공고 &lt;가제&gt;"), "웹드라마 오디션 & 공고 <가제>")

    def test_short_cafe(self):
        self.assertEqual(_short_cafe("'우리연기할래' 정보나눔카페 - 배우오디션/연기대본/연기학원.."), "우리연기할래' 정보나눔카페")
        self.assertEqual(_short_cafe("빛이 모이는 곳 [ SPOTLIGHT ] - 아역배우 이루은"), "빛이 모이는 곳")
        self.assertEqual(_short_cafe("모델나라 ★ 피팅모델구인구직"), "모델나라")


class AuditionTest(unittest.TestCase):
    def test_to_audition_fields(self):
        a = to_audition(item("단편영화 <수집> 주연배우 모집", "서류 접수기간 : 2026년 09월 20일(일) 23:00까지. 문의 cast@example.org"))
        self.assertEqual(a.source_name, "네이버카페:빛이 모이는 곳")
        self.assertEqual(str(a.deadline), "2026-09-20")
        self.assertEqual(a.apply_email, "cast@example.org")
        self.assertIn("원문 링크", a.description)

    def test_masked_email_is_none(self):
        a = to_audition(item("단편영화 배우 모집", "담당자 이메일 ***************@gmail.com 으로 지원. 마감 2026.10.01"))
        self.assertIsNone(a.apply_email)
        self.assertIsNone(a.company)


if __name__ == "__main__":
    unittest.main()
