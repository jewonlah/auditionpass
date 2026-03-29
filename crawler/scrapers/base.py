from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import Optional
import re
import logging

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

    @staticmethod
    def extract_email(text: str) -> Optional[str]:
        """텍스트에서 이메일 주소 추출"""
        pattern = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
        match = re.search(pattern, text)
        if not match:
            return None
        email = match.group()
        # 노이즈 이메일 제외
        noise = ("example.com", "test.com", "noreply", "no-reply")
        if any(n in email.lower() for n in noise):
            return None
        return email

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
