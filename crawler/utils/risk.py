# -*- coding: utf-8 -*-
"""구조적 위험 점수 v0 (플랜 37 §2 auto-triage · 36 §4) — 키워드+구조 신호 합산.

키워드 필터(_SCAM 등)가 못 잡는 "정상처럼 보이는" 위험 공고를 점수로 거른다:
비용 징수 문맥, 무급+상업 사용, 프로필 수집 의심(정보 비대칭), 사칭(유명사+개인 메일).
LLM 없이 정규식·휴리스틱만. 점수 ≥7 → quarantine(비활성), 4~6 → pending 강등.
"""

import re

# 비용 징수 (지급이 아닌 돈 요구)
_FEE = re.compile(
    r"참가비|등록비|수강료|교육비|레슨비|워크\s*샵\s*비|프로필\s*촬영비|포트폴리오\s*비용|"
    r"보증금|계약금\s*입금|선\s*입금|자부담|본인\s*부담|비용\s*발생|유료\s*(?:교육|촬영|클래스)"
)
_FEE_NEGATE = re.compile(r"(참가비|등록비|수강료|비용)\s*(?:은|는)?\s*(?:일체\s*)?(?:없|무료|X|x|없습니다|없음)")
# 성인·노출 (미성년 감지와 조합 시 즉시 격리 — 조합 판정은 호출부)
_ADULT = re.compile(r"노출\s*(?:있|가능|수위)|세미\s*누드|누드|란제리|속옷\s*(?:화보|촬영)|성인\s*화보|수위\s*(?:있|촬영)")
# 위험 연락 채널
_RISKY_CHANNEL = re.compile(r"텔레그램|라인\s*(?:아이디|ID)|비밀\s*(?:오픈)?채팅|익명\s*(?:방|채팅)")
# 과장 보상
_HYPE = re.compile(r"데뷔\s*보장|합격\s*보장|100%\s*(?:데뷔|합격)|바로\s*데뷔|당일\s*고액|초보\s*고액")
# 신원·금융 과다 요구
_IDENTITY = re.compile(r"신분증\s*(?:사본|사진)|주민등록증|주민번호|통장\s*사본|계좌\s*비밀번호|가족관계증명서")
# 무급 신호 + 상업 사용 문맥 (무급 착취)
_UNPAID = re.compile(r"무급|노\s*페이|no\s*pay|열정\s*페이|페이\s*없")
_COMMERCIAL = re.compile(r"광고|브랜드|홍보\s*영상|커머셜|바이럴|판매|프로모션")
# 징수 강신호 (돈이 실제로 오가는 문맥 — 징수와 결합 시 가중)
_FEE_STRONG = re.compile(r"입금|본인\s*부담|자부담|납부|결제|선착순\s*송금")
# 제작 주체 신호 (있으면 정보 비대칭 해제)
_PRODUCER = re.compile(r"제작사|프로덕션|극단|기획사|스튜디오|감독|연출|\(주\)|주식회사|팀\s*소개")


def risk_score(title: str, description: str | None) -> tuple[int, list[str]]:
    """(점수, 사유 목록). 7+ 격리 권장, 4~6 pending 권장."""
    text = f"{title or ''}\n{description or ''}"
    score = 0
    reasons: list[str] = []

    if _FEE.search(text) and not _FEE_NEGATE.search(text):
        score += 4
        reasons.append("비용 징수 문맥")
        if _FEE_STRONG.search(text):
            score += 2
            reasons.append("징수 강신호(입금·본인 부담)")
    if _ADULT.search(text):
        score += 4
        reasons.append("성인·노출")
    if _IDENTITY.search(text):
        score += 4
        reasons.append("신분증·금융정보 요구")
    if _HYPE.search(text):
        score += 3
        reasons.append("과장 보상(데뷔·합격 보장)")
    if _RISKY_CHANNEL.search(text):
        score += 2
        reasons.append("위험 연락 채널")
    if _UNPAID.search(text) and _COMMERCIAL.search(text):
        score += 3
        reasons.append("무급+상업 사용(착취 의심)")
    # 정보 비대칭: 요구는 있는데 제작 주체 단서가 전혀 없음
    asks = len(re.findall(r"프로필|사진|영상|연락처|이메일|지원", text))
    if asks >= 3 and not _PRODUCER.search(text):
        score += 2
        reasons.append("정보 비대칭(주체 불명+요구 과다)")

    return score, reasons
