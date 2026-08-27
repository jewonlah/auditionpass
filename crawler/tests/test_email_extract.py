# -*- coding: utf-8 -*-
"""utils.email_extract 접수 이메일 추출 테스트 (플랜 30 §2 2-2).

오발송 방어가 목적이라 "잘못된 메일을 고르느니 None"이 기준이다.
"""

import unittest

from utils.email_extract import extract_apply_email, is_apply_email


class TestApplyEmailFilter(unittest.TestCase):
    def test_freemail_ok(self):
        self.assertTrue(is_apply_email("casting2026@naver.com"))
        self.assertTrue(is_apply_email("pd.kim@gmail.com"))

    def test_operational_local_rejected(self):
        # staff@filmmakers 오탐 실측 — 로컬파트만으로도 거른다
        for addr in ("staff@somestudio.co.kr", "admin@studio.com",
                     "help@studio.com", "no-reply@studio.com"):
            self.assertFalse(is_apply_email(addr), addr)

    def test_source_domain_rejected(self):
        # 애그리게이터 자체 메일이 접수처로 저장되면 유저 지원 메일이 엉뚱한 곳으로 간다
        self.assertFalse(is_apply_email("contact@castik.co.kr", source="https://castik.co.kr"))
        self.assertFalse(is_apply_email("contact@www.castik.co.kr", source="castik.co.kr"))

    def test_freemail_exempt_from_source_domain(self):
        # 네이버 카페 소스의 접수처는 대부분 @naver.com — 소스 도메인만 보고 자르면 트랙이 죽는다
        self.assertTrue(is_apply_email("cast2026@naver.com", source="https://openapi.naver.com/v1/search/cafearticle"))

    def test_platform_domain_rejected(self):
        for addr in ("info@megaphonekorea.com", "aaa@filmmakers.co.kr", "bbb@casting114.com"):
            self.assertFalse(is_apply_email(addr), addr)

    def test_own_domain_rejected(self):
        self.assertFalse(is_apply_email("cast@auditionpass.co.kr"))

    def test_masked_rejected(self):
        # 네이버 검색 API가 마스킹해서 내려주는 형태
        self.assertFalse(is_apply_email("o***@naver.com"))

    def test_asset_filename_rejected(self):
        self.assertFalse(is_apply_email("logo@2x.png"))
        self.assertFalse(is_apply_email("sprite@2x.webp"))

    def test_placeholder_rejected(self):
        self.assertFalse(is_apply_email("your@example.com"))

    def test_cafe_subdomain_rejected(self):
        self.assertFalse(is_apply_email("board@cafe.naver.com"))


class TestExtractApplyEmail(unittest.TestCase):
    def test_body_beats_footer(self):
        # 첫 매치를 집던 옛 구현이 틀리던 케이스 — 푸터 메일이 본문보다 앞에 있다
        text = (
            "고객센터 문의: cs@bigsite.co.kr\n"
            "사업자등록번호 123-45-67890\n\n"
            "[단편영화 배우 모집]\n"
            "프로필과 자기소개를 아래 메일로 지원 접수해 주세요.\n"
            "castingteam@studio-nine.co.kr\n"
        )
        self.assertEqual(extract_apply_email(text), "castingteam@studio-nine.co.kr")

    def test_footer_only_returns_none(self):
        # 접수처를 못 찾으면 사이트 문의 메일을 쓰느니 external 공고로 둔다
        text = ("모델 모집합니다. 자세한 내용은 홈페이지 참고.\n\n"
                "---\nCopyright 2026 BigSite. 고객센터 cs@bigsite.co.kr | 이용약관")
        self.assertIsNone(extract_apply_email(text))

    def test_source_self_mail_skipped_for_body_mail(self):
        text = ("공고 소개\n촬영 스태프 모집\n"
                "문의 admin@castik.co.kr\n"
                "지원은 recruit@nine-film.com 으로 프로필 제출")
        self.assertEqual(extract_apply_email(text, source="https://castik.co.kr"),
                         "recruit@nine-film.com")

    def test_url_fragment_not_email(self):
        text = "블로그 https://blog.naver.com/castingman@naver.com/223 참고"
        self.assertIsNone(extract_apply_email(text))

    def test_obfuscated_recovered(self):
        text = "지원 접수는 castkorea 골뱅이 naver.com 으로 프로필 보내주세요"
        self.assertEqual(extract_apply_email(text), "castkorea@naver.com")

    def test_at_word_not_misread(self):
        # 영문 " at " 표기를 난독화로 보면 "chat gmail.com" → "ch@gmail.com" 오탐이 난다
        self.assertIsNone(extract_apply_email("오픈 chat gmail.com 안내"))

    def test_official_page_own_domain_allowed(self):
        # 기획사 공식 페이지는 자기 도메인 메일이 곧 접수처 — source를 안 넘기면 통과해야 한다
        text = "신인 배우 상시 모집. 프로필 지원: casting@rbw-ent.co.kr"
        self.assertEqual(extract_apply_email(text), "casting@rbw-ent.co.kr")

    def test_empty(self):
        self.assertIsNone(extract_apply_email(""))
        self.assertIsNone(extract_apply_email(None))


if __name__ == "__main__":
    unittest.main()
