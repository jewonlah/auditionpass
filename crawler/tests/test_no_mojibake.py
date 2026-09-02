"""재발 방지 회귀 테스트 — U+FFFD(깨진 문자) 리터럴 검출.

배경: castingnara.py의 source_name 상수("캐스팅나라")가 2026-04-03 최초 커밋부터
인코딩이 깨진 채(U+FFFD 포함) 4.5개월(~2026-08-27) 운영됐다. DB 27행 + 코드 7곳을
fix_source_encoding.py --apply로 수복했고(로드맵 2-3, 2026-08-27 완료), 이 테스트는
같은 패턴(소스 상수·문자열 리터럴에 U+FFFD가 섞여 들어가는 것)이 다시 커밋되는 것을
막는다.

scrapers/*.py, sns_sources/*.py, utils/*.py, main.py를 UTF-8로 읽어 U+FFFD 리터럴이
있으면 실패한다. 단 utils/classifier.py와 utils/quality.py는 이미 깨져 들어온 소스명을
방어적으로 정규화하는 로직이라 의도적으로 '�' 문자를 다루므로 허용 목록으로 제외한다.
"""
import unittest
from pathlib import Path

CRAWLER_ROOT = Path(__file__).resolve().parent.parent

# 손상 문자(U+FFFD)를 걷어내는 방어 로직이라 의도적으로 리터럴을 쓰는 파일 — 제외
ALLOWLIST = {
    CRAWLER_ROOT / "utils" / "classifier.py",
    CRAWLER_ROOT / "utils" / "quality.py",
}

TARGET_GLOBS = [
    "scrapers/*.py",
    "sns_sources/*.py",
    "utils/*.py",
    "main.py",
]


def _target_files():
    files = []
    for pattern in TARGET_GLOBS:
        files.extend(sorted(CRAWLER_ROOT.glob(pattern)))
    return files


class TestNoMojibake(unittest.TestCase):
    def test_no_u_fffd_literal_in_source_files(self):
        checked = 0
        for path in _target_files():
            if path in ALLOWLIST:
                continue
            checked += 1
            text = path.read_text(encoding="utf-8")
            self.assertNotIn(
                "�",
                text,
                msg=f"{path}에 U+FFFD(깨진 문자) 리터럴이 있습니다. "
                "인코딩 손상 가능성 — fix_source_encoding.py 참조.",
            )
        # 스캔 대상이 비어 있으면(경로 오탐) 테스트가 무의미하게 통과하는 것을 방지
        self.assertGreater(checked, 0, "스캔 대상 파일이 0개입니다 — 경로 확인 필요")


if __name__ == "__main__":
    unittest.main()
