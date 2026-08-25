# -*- coding: utf-8 -*-
"""인테이크 규칙 추출기 골든셋 (플랜 38 P1-2) — 실제 공고 문체 표본.

목표(37 §4): 이메일 precision 1.0, 마감 정확 일치, 위험 격리 recall.
"""

import unittest
from datetime import date

from tools.ingest import extract_fields, oneclick_check
from utils.risk import risk_score

GOLDEN = [
    {
        "name": "아기모델_이메일_마감없음",
        "text": "브랜드 촬영 다문화 아기모델 모집\n회사명: 디바엔터테인먼트\n모집 대상: 키 68~89cm 아기 (성별무관)\n촬영 일정: 9월 예정, 장소: 서울\n페이: 캐스팅 후 개별 안내\n지원 방법 이메일: divaent@naver.com",
        "email": "divaent@naver.com", "deadline": None, "quarantine": False,
    },
    {
        "name": "단편영화_이메일_마감명시",
        "text": "단편영화 <여름끝> 주연 배우 모집\n한국예술대 졸업작품. 감독 김OO\n출연료 회차당 10만원\n마감: 2026-09-05\n프로필과 연기영상을 boyoung.film@gmail.com 으로 보내주세요",
        "email": "boyoung.film@gmail.com", "deadline": date(2026, 9, 5), "quarantine": False,
    },
    {
        "name": "뮤지컬_전배역",
        "text": "창작뮤지컬 [시작] 전 배역 캐스팅\n주최: 극단 시작\n접수기간: 2026.08.13 ~ 2026.09.27\n지원: musical.start@naver.com",
        "email": "musical.start@naver.com", "deadline": date(2026, 9, 27), "quarantine": False,
    },
    {
        "name": "구글폼_공고",
        "text": "웹드라마 조연 배우 모집 (20대 남녀)\n제작: 스튜디오온\n지원 폼: https://forms.gle/abc123xyz\n마감 2026-09-10",
        "email": None, "deadline": date(2026, 9, 10), "form": "https://forms.gle/abc123xyz", "quarantine": False,
    },
    {
        "name": "참가비_격리",
        "text": "신인 배우 오디션 모집\n참가비 20만원 입금 후 오디션 진행\n프로필 사진, 연락처, 이메일 지원",
        "email": None, "deadline": None, "quarantine": True,
    },
    {
        "name": "무급상업_경고",
        "text": "브랜드 홍보 영상 모델 모집\n무급이지만 포트폴리오에 좋아요. 광고 영상 활용\n프로필, 사진, 연락처를 보내주세요",
        "email": None, "deadline": None, "quarantine": False, "risk_min": 3,
    },
    {
        "name": "전화만_공고",
        "text": "행사 MC 모집\n주최: OO이벤트\n문의 010-1234-5678\n서울 코엑스, 9월 12일 행사",
        "email": None, "quarantine": False,
    },
    {
        "name": "대리지원_금지",
        "text": "국립극단 시즌단원 오디션\n접수: audition@ntck.or.kr\n마감 2026-09-30\n대리 접수 불가, 본인 직접 지원 바랍니다",
        "email": "audition@ntck.or.kr", "deadline": date(2026, 9, 30), "quarantine": False,
        "oneclick_blocked": True,
    },
    {
        "name": "빈약_공고",
        "text": "배우 모집합니다\n자세한 건 DM",
        "email": None, "deadline": None, "quarantine": False,
    },
    {
        "name": "범위마감_종료일",
        "text": "독립영화 조연 모집\n모집기간: 2026.8.20 ~ 2026.9.10\n접수: indiefilm.cast@daum.net",
        "email": "indiefilm.cast@daum.net", "deadline": date(2026, 9, 10), "quarantine": False,
    },
    {
        "name": "신분증요구_격리",
        "text": "고수익 모델 모집\n지원 시 신분증 사본과 통장 사본 첨부\n텔레그램으로 연락",
        "email": None, "quarantine": True,
    },
    {
        "name": "쇼호스트_정상",
        "text": "라이브커머스 쇼호스트 모집\n(주)커머스랩. 주 2회 고정, 회당 15만원 지급\n이력서와 진행 영상을 recruit@commercelab.co.kr 로 접수\n마감: 2026년 9월 15일",
        "email": "recruit@commercelab.co.kr", "deadline": date(2026, 9, 15), "quarantine": False,
    },
]


class TestIngestGolden(unittest.TestCase):
    def test_email_precision(self):
        for g in GOLDEN:
            f = extract_fields(g["text"])
            self.assertEqual(f["apply_email"]["value"], g.get("email"),
                             f"{g['name']}: email {f['apply_email']['value']!r}")

    def test_deadline(self):
        for g in GOLDEN:
            if "deadline" not in g:
                continue
            f = extract_fields(g["text"])
            got = f["deadline"]["value"]
            want = g["deadline"].isoformat() if g["deadline"] else None
            self.assertEqual(got, want, f"{g['name']}: deadline {got!r} != {want!r}")

    def test_form_url(self):
        for g in GOLDEN:
            if "form" not in g:
                continue
            f = extract_fields(g["text"])
            self.assertEqual(f["form_url"]["value"], g["form"], g["name"])

    def test_risk(self):
        for g in GOLDEN:
            s, _ = risk_score(g["text"].splitlines()[0], g["text"])
            self.assertEqual(s >= 7, g["quarantine"], f"{g['name']}: risk {s}")
            if "risk_min" in g:
                self.assertGreaterEqual(s, g["risk_min"], g["name"])

    def test_evidence_present_when_value(self):
        for g in GOLDEN:
            f = extract_fields(g["text"])
            if f["apply_email"]["value"]:
                self.assertTrue(f["apply_email"]["evidence"], f"{g['name']}: email evidence 없음")

    def test_oneclick_no_proxy_blocker(self):
        g = next(x for x in GOLDEN if x["name"] == "대리지원_금지")
        f = extract_fields(g["text"])
        cand = {"fields": f, "source": {"type": "public_url", "url": "https://ntck.or.kr/x"},
                "risk": {"score": 0, "reasons": [], "quarantine": False}}
        ok, blockers = oneclick_check(cand, g["text"])
        self.assertFalse(ok)
        self.assertIn("대리 지원 금지 문구", blockers)


if __name__ == "__main__":
    unittest.main()
