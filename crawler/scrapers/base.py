from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import Optional
import re
import logging

from utils.email_extract import extract_apply_email

logger = logging.getLogger(__name__)

# 공지사항/노이즈 제목 필터
SKIP_TITLE_PATTERNS = [
    r"\[공지",
    r"\[안내",
    r"\[이벤트",
    r"공지사항",
    r"Powered by",
    r"var kakao",
    r"var Kakao",
    r"더보기$",
]
_SKIP_RE = re.compile("|".join(SKIP_TITLE_PATTERNS), re.IGNORECASE)


@dataclass
class AuditionData:
    title: str
    company: Optional[str]
    genre: str  # '배우' | '모델' | '기타'
    deadline: Optional[date]
    apply_email: Optional[str]
    description: Optional[str]
    requirements: Optional[str]
    source_url: str
    source_name: str


class BaseScraper(ABC):
    source_name: str = ""
    base_url: str = ""

    @abstractmethod
    def scrape(self) -> list[AuditionData]:
        """공고 목록을 수집하고 반환"""
        pass

    @staticmethod
    def is_noise_title(title: str) -> bool:
        """공지사항/노이즈 제목 여부 판단"""
        return bool(_SKIP_RE.search(title))

    @classmethod
    def extract_email(cls, text: str, source: str = "") -> Optional[str]:
        """텍스트에서 접수 이메일 추출.

        판정은 `utils.email_extract`가 정본 — 여기에 규칙을 다시 쓰지 말 것.
        `source`를 생략하면 클래스의 `base_url`을 소스 도메인으로 써서 사이트
        자체 메일(admin@castik.co.kr 등)을 자동 제외한다. 소스 하나가 여러
        사이트를 도는 스크레이퍼(official_pages)는 페이지 URL을 넘긴다.
        """
        return extract_apply_email(text, source=source or cls.base_url)

    @staticmethod
    def extract_phone(text: str) -> Optional[str]:
        """텍스트에서 전화번호 추출 (010-xxxx-xxxx, 02-xxx-xxxx 등)"""
        patterns = [
            r"(01[016789][-.\s]?\d{3,4}[-.\s]?\d{4})",
            r"(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})",
        ]
        for pat in patterns:
            match = re.search(pat, text)
            if match:
                return match.group().strip()
        return None

    @staticmethod
    def extract_location(text: str) -> Optional[str]:
        """텍스트에서 장소 정보 추출"""
        # "장소:", "오디션 장소:", "위치:" 뒤의 텍스트
        patterns = [
            r"(?:장소|위치|오디션\s*장소|공연\s*장소|촬영\s*장소)\s*[:：]\s*(.+)",
            r"(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n,]{2,30}",
        ]
        for pat in patterns:
            match = re.search(pat, text)
            if match:
                result = match.group(1) if match.lastindex else match.group()
                return result.strip()[:100]
        return None

    @staticmethod
    def parse_deadline(text: str) -> Optional[date]:
        """마감일 텍스트를 date로 파싱"""
        patterns = [
            r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})",
            r"(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})",
            # "4월 10일", "4/10" (올해 기준)
            r"(\d{1,2})월\s*(\d{1,2})일",
        ]
        for pat in patterns:
            match = re.search(pat, text)
            if match:
                groups = match.groups()
                try:
                    if len(groups) == 3:
                        year = int(groups[0])
                        if year < 100:
                            year += 2000
                        return date(year, int(groups[1]), int(groups[2]))
                    elif len(groups) == 2:
                        # 월/일만 있으면 올해로 추정
                        today = date.today()
                        d = date(today.year, int(groups[0]), int(groups[1]))
                        if d < today:
                            d = date(today.year + 1, int(groups[0]), int(groups[1]))
                        return d
                except ValueError:
                    continue
        return None

    @staticmethod
    def parse_deadline_smart(text: str) -> Optional[date]:
        """마감일 파싱 개선(2-3): '모집기간/접수/마감 A ~ B' 범위가 있으면 **종료일 B**(가장 늦은 것),
        없으면 마감 라벨 근처의 날짜, 그것도 없으면 본문 첫 날짜. 전화번호 오탐 방지를 위해 전화번호는 먼저 제거."""
        if not text:
            return None
        clean = re.sub(r"\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b", " ", text)
        date_tok = r"(?:\d{2,4}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}일?)"
        ends: list[date] = []
        for m in re.finditer(rf"({date_tok})\s*[~∼\-–]\s*({date_tok})", clean):
            d = BaseScraper.parse_deadline(m.group(2))
            if d:
                ends.append(d)
        if ends:
            return max(ends)
        near = re.search(rf"(?:마감|접수\s*마감|모집\s*마감|지원\s*마감|까지)[^\n]{{0,25}}?({date_tok})", clean) or \
               re.search(rf"({date_tok})[^\n]{{0,12}}?(?:까지|마감)", clean)
        if near:
            d = BaseScraper.parse_deadline(near.group(1))
            if d:
                return d
        return BaseScraper.parse_deadline(clean)

    @staticmethod
    def classify_genre(text: str) -> str:
        """텍스트에서 장르 분류"""
        text_lower = text.lower()
        model_keywords = ["모델", "model", "패션", "화보", "런웨이", "광고모델"]
        actor_keywords = [
            "배우", "연기", "드라마", "영화", "뮤지컬", "연극",
            "오디션", "캐스팅", "시리즈", "웹드라마", "단편",
        ]
        model_score = sum(1 for kw in model_keywords if kw in text_lower)
        actor_score = sum(1 for kw in actor_keywords if kw in text_lower)
        if model_score > actor_score:
            return "모델"
        if actor_score > 0:
            return "배우"
        return "기타"

    def build_description(self, text: str, phone: Optional[str] = None,
                          location: Optional[str] = None) -> Optional[str]:
        """상세 설명 텍스트 조합 (연락처/장소 포함)"""
        parts: list[str] = []
        if text:
            parts.append(text[:2000])
        extras: list[str] = []
        if location:
            extras.append(f"장소: {location}")
        if phone:
            extras.append(f"연락처: {phone}")
        if extras:
            parts.append("\n\n---\n" + "\n".join(extras))
        return "".join(parts) if parts else None
