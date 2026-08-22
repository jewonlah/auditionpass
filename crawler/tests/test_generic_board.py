"""범용 게시판 스크레이퍼 테스트 (플랜 E-4). 네트워크 없음 — HTML 문자열로 파싱 로직만."""
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

from scrapers.generic_board import BOARDS, Board, GenericBoardScraper, _longest_block, _title, _text_of

LIST_HTML = """<html><body>
<a href="/sub/view.php?int_gbn=1&amp;Txt_bcode=031110001&amp;str_no=202608220001">A</a>
<a href="/sub/view.php?int_gbn=1&amp;Txt_bcode=031110001&amp;str_no=202608220002">B</a>
<a href="/sub/list.php?int_gbn=1">list</a>
<td onclick="goDetail('4279')">x</td>
</body></html>"""

DETAIL_HTML = """<html><head><title>2026 연극 《침묵의 고백》 배우 모집 공고 - 콘테스트코리아</title>
<meta property="og:title" content="2026 연극 《침묵의 고백》 배우 모집 공고"></head>
<body><nav>메뉴 메뉴 메뉴</nav>
<div id="content">
<p>주최: 극단 빛</p><p>모집 배역: 20~30대 남녀 배우 4명</p><p>접수 마감: 2026.09.10 까지</p>
<p>지원 방법: 프로필을 cast@example.org 로 보내주세요. 문의 02-1234-5678</p>
<p>공연 장소: 서울 대학로 소극장. 공연 기간 11월. 출연료 회당 10만원. 자세한 내용은 첨부 참고.</p>
<p>기타: 연기 경험자 우대, 단체 사진 촬영 있음, 리허설은 10월부터 주 3회 진행합니다.</p>
</div><footer>회사소개 이용약관</footer></body></html>"""


class ListTest(unittest.TestCase):
    def test_href_regex_and_amp(self):
        b = Board("t", ["https://contestkorea.com/sub/list.php"], r"/sub/view\.php\?int_gbn=\d+&Txt_bcode=\d+&str_no=\d+")
        s = GenericBoardScraper(b)
        with patch.object(GenericBoardScraper, "_get") as g:
            g.return_value = type("R", (), {"text": LIST_HTML})()
            with patch("scrapers.generic_board.time.sleep"):
                links = s.list_links()
        self.assertEqual(len(links), 2)
        self.assertTrue(links[0].startswith("https://contestkorea.com/sub/view.php?int_gbn=1&Txt_bcode="))

    def test_id_template(self):
        b = Board("p", ["http://www.playdb.co.kr/community/Publicity_list.asp?bbsno=29"], r"goDetail\('(\d+)'\)",
                  detail_tpl="http://www.playdb.co.kr/community/Publicity_Detail.asp?bbsno=29&No={id}")
        s = GenericBoardScraper(b)
        with patch.object(GenericBoardScraper, "_get") as g:
            g.return_value = type("R", (), {"text": LIST_HTML})()
            with patch("scrapers.generic_board.time.sleep"):
                links = s.list_links()
        self.assertEqual(links, ["http://www.playdb.co.kr/community/Publicity_Detail.asp?bbsno=29&No=4279"])


class DetailTest(unittest.TestCase):
    def test_parse_detail(self):
        b = Board("콘테스트코리아", ["https://contestkorea.com/"], r"x")
        s = GenericBoardScraper(b)
        with patch.object(GenericBoardScraper, "_get") as g:
            g.return_value = type("R", (), {"text": DETAIL_HTML})()
            a = s.parse_detail("https://contestkorea.com/sub/view.php?str_no=1")
        self.assertIsNotNone(a)
        self.assertEqual(a.title, "2026 연극 《침묵의 고백》 배우 모집 공고")
        self.assertEqual(a.apply_email, "cast@example.org")
        self.assertEqual(str(a.deadline), "2026-09-10")
        self.assertIn("• 배역", a.description)
        self.assertNotIn("회사소개", a.description)

    def test_site_footer_email_excluded(self):
        html = DETAIL_HTML.replace("cast@example.org", "webmaster@contestkorea.com")
        b = Board("콘테스트코리아", ["https://contestkorea.com/"], r"x")
        with patch.object(GenericBoardScraper, "_get") as g:
            g.return_value = type("R", (), {"text": html})()
            a = GenericBoardScraper(b).parse_detail("https://contestkorea.com/sub/view.php?str_no=1")
        self.assertIsNone(a.apply_email)

    def test_title_filter_skips_non_audition(self):
        html = DETAIL_HTML.replace("배우 모집 공고", "강사 모집 안내")
        b = Board("t", ["https://x/"], r"x")
        with patch.object(GenericBoardScraper, "_get") as g:
            g.return_value = type("R", (), {"text": html})()
            self.assertIsNone(GenericBoardScraper(b).parse_detail("https://x/1"))

    def test_helpers(self):
        soup = _text_of(BeautifulSoup(DETAIL_HTML, "html.parser"))
        self.assertEqual(_title(soup, None), "2026 연극 《침묵의 고백》 배우 모집 공고")
        self.assertIn("모집 배역", _longest_block(soup))

    def test_board_config_sane(self):
        for b in BOARDS:
            self.assertTrue(b.list_urls and b.link_re, b.name)


if __name__ == "__main__":
    unittest.main()
