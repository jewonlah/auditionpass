# -*- coding: utf-8 -*-
"""접수 이메일 추출 — 정본 (플랜 30 §2 2-2 "extract_email 상향").

이메일 추출·거부 판정은 **이 모듈만** 고친다. 이전에는 같은 규칙이
`scrapers/base.py` · `scrapers/castik.py` · `tools/ingest.py` ·
`sns_sources/{naver_cafe,naver_web,instagram_caption,cafe_body}.py` 에 따로 있었고,
한쪽만 고쳐 오발송이 나는 패턴이 반복됐다(37·39 리뷰의 "규칙 이중 유지" 결함군).

상향 3가지:
1. **첫 매치가 아니라 문맥 점수 최고 후보** — 푸터의 사이트 문의 메일이 본문
   접수처보다 앞에 나오는 페이지가 많다. `re.search` 첫 매치는 그걸 집었다.
2. **소스 도메인 자동 제외** — 애그리게이터 자체 메일(admin@castik.co.kr 등)이
   접수처로 저장되면 유저 지원 메일이 엉뚱한 곳으로 간다.
   단 **프리메일은 면제** — 네이버 카페 소스의 접수처는 대부분 @naver.com이라
   소스 도메인만 보고 자르면 카페 트랙 전체가 죽는다.
3. **운영성 로컬파트 제외** — staff@ / admin@ / help@ 등(staff@filmmakers 오탐 실측).
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

# 이메일 후보. TLD는 아래 _BAD_TLD로 한 번 더 거른다.
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")

# "골뱅이" 표기 난독화 (카페·SNS 본문에서 실측).
# 영문 " at " 표기는 일부러 뺐다 — "chat gmail.com"이 "ch@gmail.com"으로 잡히는 오탐이 난다.
OBFUSCATED_RE = re.compile(
    r"[A-Za-z0-9._%+-]+\s*\(?\s*(?:골뱅이|앳)\s*\)?\s*[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+"
)

# 접수처가 아닌 운영성 로컬파트.
# marketing@ / sales@ 는 일부러 뺐다 — 광고·모델 모집은 제작사 마케팅팀이 접수처인 경우가
# 실제로 있다(marketing@1centi.co.kr 실측). 시스템·고객센터 계정만 거른다.
_REJECT_LOCAL = re.compile(
    r"^(?:staff|admin|webmaster|postmaster|master|help|cs|support|noreply|no-reply|"
    r"donotreply|privacy|abuse|newsletter|hosting)$", re.I)

# 이메일이 아닌 것 (이미지 파일명·자산 경로가 @를 끼고 잡히는 경우)
_BAD_TLD = re.compile(
    r"^(?:png|jpe?g|gif|webp|svg|bmp|ico|css|js|json|xml|pdf|zip|mp4|woff2?|ttf|eot)$", re.I)

# 예시·테스트 도메인 + 자사 도메인(우리 메일이 접수처로 저장되면 안 된다)
_PLACEHOLDER_HOSTS = {"example.com", "example.org", "test.com", "domain.com",
                      "email.com", "yourmail.com", "sample.com",
                      "auditionpass.co.kr", "auditionpass.com"}

# 프리메일 — 소스 도메인/플랫폼 제외 규칙에서 면제한다(개인·소규모 제작사의 실제 접수처)
FREEMAIL_HOSTS = {
    "naver.com", "gmail.com", "daum.net", "hanmail.net", "nate.com", "kakao.com",
    "outlook.com", "hotmail.com", "yahoo.com", "yahoo.co.kr", "icloud.com",
    "protonmail.com", "proton.me", "korea.com", "empas.com", "dreamwiz.com",
}

# 도메인 끝의 공용 접미사 토큰 — 핵심 라벨을 뽑을 때 벗겨낸다
_SUFFIX_TOKENS = {"com", "net", "org", "kr", "co", "or", "ne", "go", "re", "pe", "ac",
                  "io", "me", "tv", "biz", "info", "us", "jp", "cn", "xyz", "site",
                  "shop", "dev", "app", "cc", "email", "asia"}

# 지원·접수 문맥 (강/약)
_CTX_STRONG = re.compile(r"지원|접수|제출|보내|보낼|보내주|송부|첨부|메일로|apply|mailto", re.I)
_CTX_WEAK = re.compile(r"메일|이메일|e-?mail|프로필|서류|연락", re.I)
# 푸터·회사 정보 문맥
_CTX_FOOTER = re.compile(
    r"저작권|copyright|all\s*rights|고객\s*센터|고객\s*지원|개인정보|사업자\s*등록|"
    r"이용\s*약관|광고\s*문의|제휴\s*문의|호스팅|통신판매|대표\s*이사|본사|오시는\s*길", re.I)

_CTX_BEFORE = 150
_CTX_AFTER = 60


def _core_label(host: str) -> str:
    """도메인의 핵심 라벨. www.filmmakers.co.kr → 'filmmakers', naver.com → 'naver'."""
    parts = [p for p in host.lower().strip().strip(".").split(".") if p]
    while len(parts) > 1 and parts[-1] in _SUFFIX_TOKENS:
        parts.pop()
    return parts[-1] if parts else ""


def _host_of(source: str) -> str:
    """base_url·source_url·호스트 문자열 어느 쪽이 와도 호스트를 뽑는다."""
    if not source:
        return ""
    s = source.strip()
    if "://" not in s:
        s = "http://" + s
    host = (urlparse(s).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _platform_hosts() -> tuple[str, ...]:
    """애그리게이터·포털 도메인 — sns_sources.exclude_domains가 정본(중복 정의 금지)."""
    try:
        from sns_sources.exclude_domains import AGGREGATORS, PORTALS
        return tuple(AGGREGATORS) + tuple(PORTALS)
    except Exception:  # pragma: no cover - 패키지 경로 밖에서 import된 경우
        return ()


def is_apply_email(email: str | None, *, source: str = "") -> bool:
    """접수처로 쓸 수 있는 이메일인지. `source`는 base_url·source_url·호스트 아무거나."""
    if not email:
        return False
    email = email.strip().strip(".").lower()
    if "*" in email or email.count("@") != 1:
        return False  # 마스킹된 검색 API 응답(o***@naver.com)

    local, _, host = email.partition("@")
    if not local or not host or "." not in host:
        return False
    if _REJECT_LOCAL.match(local):
        return False
    tld = host.rsplit(".", 1)[-1]
    if _BAD_TLD.match(tld) or len(tld) < 2 or tld.isdigit():
        return False
    if host in _PLACEHOLDER_HOSTS:
        return False
    if host.startswith("cafe.") or host.startswith("blog."):
        return False  # cafe.naver.com 등 URL 조각

    if host in FREEMAIL_HOSTS:
        return True  # 프리메일은 소스·플랫폼 도메인 제외에서 면제

    core = _core_label(host)
    if not core:
        return False
    src_core = _core_label(_host_of(source))
    if src_core and core == src_core:
        return False  # 소스 사이트 자체 메일
    if any(core == _core_label(p) for p in _platform_hosts()):
        return False  # 애그리게이터·포털 자체 메일
    return True


def _score(text: str, start: int, end: int) -> int:
    before = text[max(0, start - _CTX_BEFORE):start]
    after = text[end:end + _CTX_AFTER]
    window = before + " " + after
    score = 0
    if _CTX_STRONG.search(window):
        score += 2
    if _CTX_WEAK.search(window):
        score += 1
    if _CTX_FOOTER.search(window):
        score -= 3
    return score


def extract_apply_email(text: str | None, *, source: str = "",
                        allow_obfuscated: bool = True) -> str | None:
    """본문에서 접수 이메일 1개. 문맥 점수 최고 후보를 고르고, 동점이면 먼저 나온 것.

    푸터 문맥에만 있는 후보(점수 < 0)는 버린다 — 사이트 문의 메일을 접수처로
    저장하는 것보다 `apply_email=None`(external 공고)이 안전하다.
    """
    if not text:
        return None

    best: tuple[int, int, str] | None = None  # (점수, -위치, 이메일)
    for m in EMAIL_RE.finditer(text):
        raw = m.group(0)
        if text[m.end():m.end() + 1] == "/":
            continue  # 이메일이 아니라 URL 조각(@naver.com/...)
        email = raw.strip(".").lower()
        if not is_apply_email(email, source=source):
            continue
        cand = (_score(text, m.start(), m.end()), -m.start(), email)
        if best is None or cand > best:
            best = cand

    if best and best[0] >= 0:
        return best[2]

    if allow_obfuscated:
        for m in OBFUSCATED_RE.finditer(text):
            email = re.sub(r"\s*\(?\s*(?:골뱅이|앳)\s*\)?\s*", "@", m.group(0)).strip(".").lower()
            if is_apply_email(email, source=source):
                return email
    return None
