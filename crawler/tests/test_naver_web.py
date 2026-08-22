"""네이버 블로그·웹문서 소싱 필터 테스트 (플랜 E-3). 네트워크 없음."""
import unittest

from sns_sources.naver_cafe import CafeItem, is_candidate
from sns_sources.naver_web import EXCLUDE_DOMAINS, _BLOGGER_BLACKLIST, _BLOG_TITLE_BAD, _BLOG_TITLE_OK, _domain


class DomainTest(unittest.TestCase):
    def test_domain_strip_www(self):
        self.assertEqual(_domain("https://www.ntck.or.kr/ko/audition"), "ntck.or.kr")
        self.assertEqual(_domain("http://contestkorea.com/sub/list.php?x=1"), "contestkorea.com")

    def test_exclude_aggregators_and_portals(self):
        for d in ["castingchatgo.com", "audee.co.kr", "plfil.com", "blog.naver.com", "www.youtube.com", "smartstore.naver.com", "saramin.co.kr"]:
            self.assertTrue(EXCLUDE_DOMAINS.search(_domain(f"https://{d}/x")), d)
        for d in ["ntck.or.kr", "kianaent.com", "contestkorea.com", "artgy.or.kr"]:
            self.assertFalse(EXCLUDE_DOMAINS.search(d), d)


class BlogFilterTest(unittest.TestCase):
    def test_content_farm_bloggers(self):
        for b in ["건강백과365", "뉴스인사이더", "나만의 소확행 경제학", "생활정보 정리노트"]:
            self.assertTrue(_BLOGGER_BLACKLIST.search(b), b)
        self.assertFalse(_BLOGGER_BLACKLIST.search("메소드연기예술연구소"))

    def test_title_rules(self):
        ok = "(9/13) <KO 클럽> 주연 배우 오디션 공고(남성 20대, 여성 10대 후반~20대)"
        bad = "아역배우 되는법 오디션 공고 신청부터 준비 합격까지"
        self.assertTrue(_BLOG_TITLE_OK.search(ok) and not _BLOG_TITLE_BAD.search(ok))
        self.assertTrue(_BLOG_TITLE_BAD.search(bad))


class StartupNoiseTest(unittest.TestCase):
    def test_startup_audition_rejected(self):
        for t in ["제21회 경기게임오디션 모집 공고", "2026 경기창업공모(G스타오디션) 도약리그 참가자 모집 공고", "창업오디션 IR데이 참가기업 모집"]:
            it = CafeItem(title=t, description="참가 기업 모집 공고입니다. 접수 기간은 8월까지이며 지원 방법은 홈페이지 참조", link="https://x", cafename="bizinfo.go.kr", cafeurl="", keyword="t")
            ok, reason = is_candidate(it)
            self.assertFalse(ok, t)


if __name__ == "__main__":
    unittest.main()
