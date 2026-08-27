"""
인스타그램 캡션 → AuditionData 파서 (트랙 B 공통 후단)

수집 채널(캡션 원문을 어떻게 가져오는가)과 파싱을 분리한다:
  - B-2 Claude in Chrome: 브라우저 자동화가 캡션을 뽑아 아래 `parse_caption`에 넣는다 (즉시·무료)
  - B-1 관리형 API(HikerAPI/Apify): REST 응답의 caption 필드를 그대로 넣는다 (자동 cron)
  - 어느 채널이든 최종 산출물은 사이트 크롤러와 동일한 AuditionData → 기존 upsert 파이프라인 재사용

근거: docs/renewal/31_sns-sourcing-plan.md 트랙 B. D4 개정 확정 후 운용.
오디션 여부는 여기서 규칙 기반 1차 필터만 수행하고, 카테고리는 upsert 단계에서 classifier가 확정한다(2-1 연결 완료 — genre는 힌트).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

from scrapers.base import AuditionData
from utils.email_extract import extract_apply_email


# 오디션 공고로 판단하는 신호어 (하나 이상 포함해야 후보)
_AUDITION_SIGNALS = re.compile(
    r"오디션|캐스팅|배우\s*모집|모델\s*모집|출연자\s*모집|섭외|배역|모집\s*공고|단역|주연|조연|퍼포머",
)
# 명백한 비공고(광고·후기·수업 홍보) 제외 신호
_NEGATIVE_SIGNALS = re.compile(
    r"후기|수강생\s*모집|클래스\s*모집|정규\s*과정\s*모집|할인\s*이벤트|수강\s*문의",
)

# 전화번호 패턴 — 날짜 오탐 방지를 위해 캡션에서 먼저 제거 (예: 02-2138-1434의 21-14가 M/D로 오인됨)
_PHONE_RE = re.compile(r"\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b")
# 완전한 연-월-일
_DATE_RE = re.compile(r"(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})")
# 연도 없는 월-일 (마감 맥락에서만 사용 — 전역 스캔 시 전화·수량 오탐 심함)
_DATE_MD_RE = re.compile(r"(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?")
# 마감 맥락 신호 (이 근처의 날짜만 마감일로 신뢰)
_DEADLINE_CTX = re.compile(r"마감|까지|모집\s*기간|접수\s*기간|모집기한|지원\s*기간|접수|지원\s*기한|~")
# 마감이 아닌 날짜 — 이 신호가 날짜 근처에 있으면 후보에서 뺀다(촬영일을 마감으로 저장하던 원인)
_NOT_DEADLINE_CTX = re.compile(r"촬영\s*일|촬영일자|촬영\s*예정|개봉|방영|공연\s*일|행사\s*일|워크숍|리허설|미팅\s*일|생년|출생")

# 카테고리 추정 (007 genre CHECK 문자열과 일치해야 함 — 확정은 classifier)
_GENRE_HINTS = [
    ("모델", re.compile(r"모델|룩북|화보|피팅|쇼핑몰")),
    ("배우", re.compile(r"배우|연기|드라마|영화|웹드라마|단편|연극|뮤지컬|시트콤")),
]


@dataclass
class IGPost:
    """수집 채널이 채워 넣는 원자료 (캡션 + 메타). 인스타 외 플랫폼(스레드·X)도 url/platform만 채우면 같은 파서를 쓴다."""
    shortcode: str
    username: str
    caption: str
    posted_at: Optional[date] = None  # 게시일 (마감일 추정 폴백에 사용)
    url: Optional[str] = None          # 없으면 인스타 /p/{shortcode}/ 로 구성
    platform: str = "instagram"        # instagram | threads | x → source_name 접두


_PLATFORM_LABEL = {"instagram": "인스타그램", "threads": "스레드", "x": "X"}


def _guess_genre(text: str) -> str:
    for genre, rx in _GENRE_HINTS:
        if rx.search(text):
            return genre
    return "배우"  # 대다수가 연기 계열 — 기본값. classifier가 정밀화


def _deadline_context(clean: str, start: int, end: int) -> bool:
    """날짜 하나가 '마감'을 가리키는지 — 앞 40자·뒤 12자 창으로 판단 (2-3).

    전역 검사로는 안 된다. 캡션 하나에 촬영일·개봉일·마감일이 섞여 있고,
    옛 구현은 맥락 없이 `max()`를 골라 **촬영일을 마감으로 저장**했다
    (실측: 활성 공고에서 2027년 마감 같은 값이 나온 원인).
    """
    window = clean[max(0, start - 40):start] + " " + clean[end:end + 12]
    if _NOT_DEADLINE_CTX.search(window):
        return False
    return bool(_DEADLINE_CTX.search(window))


# 게시일이 불확실할 때 M/D 보정을 허용하는 최대 미래 폭.
# 오디션 마감이 반년 넘게 남는 경우는 드물고, 그런 공고는 대개 연도를 함께 쓴다.
_MD_HORIZON_DAYS = 180


def _extract_deadline(text: str, posted_at: Optional[date],
                      posted_at_exact: bool = True) -> Optional[date]:
    """모집 마감일 추출. 전화번호를 먼저 제거하고, 완전한 YYYY.MM.DD를 우선.
    완전한 날짜도 연도 없는 M/D와 똑같이 **마감 맥락이 근처에 있을 때만** 쓴다.

    `posted_at_exact=False`는 "게시일을 모른다"는 뜻이다. 네이버 카페·웹문서 검색 API는
    게시일을 주지 않아 크롤 당일을 넘기는데, 검색은 과거 글도 잡아온다. 그 상태로
    `mm < posted.month → 내년` 규칙을 쓰면 **올해 6월에 올라온 마감 지난 글이
    내년 6월 마감으로 저장**된다(실측 377건). 그래서 게시일이 불확실하면 보정 결과가
    반년을 넘어갈 때 마감 미상으로 둔다 — 틀린 미래 마감보다 미상이 안전하다."""
    clean = _PHONE_RE.sub(" ", text)  # 전화번호 오탐 제거

    # 1) 완전한 YYYY.MM.DD 중 마감 맥락에 있는 것들의 가장 늦은 날짜 (모집기간 "시작~마감"의 마감)
    candidates: list[date] = []
    for m in _DATE_RE.finditer(clean):
        if not _deadline_context(clean, m.start(), m.end()):
            continue
        y, mo, d = m.groups()
        try:
            candidates.append(date(int(y), int(mo), int(d)))
        except ValueError:
            continue
    if candidates:
        return max(candidates)

    # 2) 연도 없는 M/D — 마감 맥락이 있을 때만 (전역 스캔은 전화·수량·회차 오탐 과다)
    if posted_at and _DEADLINE_CTX.search(clean):
        for m, d in _DATE_MD_RE.findall(clean):
            try:
                mm, dd = int(m), int(d)
                if not (1 <= mm <= 12 and 1 <= dd <= 31):
                    continue
                yr = posted_at.year + (1 if mm < posted_at.month else 0)
                cand = date(yr, mm, dd)
                if not posted_at_exact and (cand - posted_at).days > _MD_HORIZON_DAYS:
                    continue  # 게시일 불명 + 먼 미래 = 연도 보정이 틀렸을 공산이 크다
                candidates.append(cand)
            except ValueError:
                continue
        if candidates:
            return max(candidates)

    return None  # 마감일 미상 → 게시 후 N일 만료 정책은 호출측에서 (upsert는 저장 허용)


_GREETING_RE = re.compile(r"^(안녕하세요|안녕하십니까|반갑습니다)")


def _title_from_caption(caption: str) -> str:
    """제목 = 오디션 신호어가 든 첫 줄 우선, 없으면 인사말 아닌 첫 유의미 줄. 이모지·기호 정리."""
    def clean(line: str) -> str:
        return re.sub(r"[\U0001F000-\U0001FAFF☀-➿️■※]", "", line).strip(" .·-")

    lines = [clean(l) for l in caption.splitlines()]
    lines = [l for l in lines if len(l) >= 6]
    # 1) 오디션 신호어가 든 첫 줄 (가장 제목다움)
    for l in lines:
        if _AUDITION_SIGNALS.search(l):
            return l[:120]
    # 2) 인사말 아닌 첫 유의미 줄
    for l in lines:
        if not _GREETING_RE.match(l):
            return l[:120]
    return (lines[0] if lines else caption.strip())[:120]


def is_audition_caption(caption: str) -> bool:
    """규칙 기반 1차 필터 (classifier 연결 전 게이트)."""
    if not caption or len(caption) < 20:
        return False
    if _NEGATIVE_SIGNALS.search(caption) and not _AUDITION_SIGNALS.search(caption):
        return False
    return bool(_AUDITION_SIGNALS.search(caption))


def parse_caption(post: IGPost) -> Optional[AuditionData]:
    """IGPost → AuditionData. 오디션 아님/마감이면 None."""
    cap = post.caption or ""
    if not is_audition_caption(cap):
        return None

    deadline = _extract_deadline(cap, post.posted_at)
    # 마감 지난 공고 제외 (호출측 filter_expired와 이중 안전장치)
    if deadline and deadline < date.today():
        return None

    apply_email = extract_apply_email(cap)

    return AuditionData(
        title=_title_from_caption(cap),
        company=post.username,  # 계정명 = 주최(추정). classifier/수기 보정 여지
        genre=_guess_genre(cap),
        deadline=deadline,
        apply_email=apply_email,  # 없으면 DM 지원형 → upsert에서 apply_type='external'
        description=cap.strip()[:2000],
        requirements=None,
        source_url=post.url or f"https://www.instagram.com/p/{post.shortcode}/",
        source_name=f"{_PLATFORM_LABEL.get(post.platform, post.platform)}:@{post.username}",
    )


def parse_many(posts: list[IGPost]) -> list[AuditionData]:
    out: list[AuditionData] = []
    for p in posts:
        a = parse_caption(p)
        if a:
            out.append(a)
    return out
