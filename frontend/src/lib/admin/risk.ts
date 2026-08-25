// crawler/utils/risk.py의 TS 포팅 (동일 규칙 유지 — 원본 변경 시 함께 갱신).
// risk 점수는 DB에 저장되지 않으므로 어드민 배지 계산 시 매번 재계산한다.
// 7+ 격리 권장, 4~6 pending 권장 (플랜 37 §2).

const FEE =
  /참가비|등록비|수강료|교육비|레슨비|워크\s*샵\s*비|프로필\s*촬영비|포트폴리오\s*비용|보증금|계약금\s*입금|선\s*입금|자부담|본인\s*부담|비용\s*발생|유료\s*(?:교육|촬영|클래스)/;
const FEE_NEGATE =
  /(참가비|등록비|수강료|비용)\s*(?:은|는)?\s*(?:일체\s*)?(?:없|무료|X|x|없습니다|없음)/;
const ADULT =
  /노출\s*(?:있|가능|수위)|세미\s*누드|누드|란제리|속옷\s*(?:화보|촬영)|성인\s*화보|수위\s*(?:있|촬영)/;
const RISKY_CHANNEL =
  /텔레그램|라인\s*(?:아이디|ID)|비밀\s*(?:오픈)?채팅|익명\s*(?:방|채팅)/;
const HYPE =
  /데뷔\s*보장|합격\s*보장|100%\s*(?:데뷔|합격)|바로\s*데뷔|당일\s*고액|초보\s*고액|고수익|고소득|월\s*\d{3,4}만\s*보장/;
const IDENTITY =
  /신분증\s*(?:사본|사진)|주민등록증|주민번호|통장\s*사본|계좌\s*비밀번호|가족관계증명서/;
const UNPAID = /무급|노\s*페이|no\s*pay|열정\s*페이|페이\s*없/;
const COMMERCIAL = /광고|브랜드|홍보\s*영상|커머셜|바이럴|판매|프로모션/;
const FEE_STRONG = /입금|본인\s*부담|자부담|납부|결제|선착순\s*송금/;
const PRODUCER =
  /제작사|프로덕션|극단|기획사|스튜디오|감독|연출|\(주\)|주식회사|팀\s*소개/;

// 미성년 대상 감지 — quarantine_sweep.py의 조합 판정(미성년+민감)용
const MINOR = /아역|미성년|초등|유치원|유아|아동|키즈|\b[1-9]\s*세|1[0-3]\s*세/;

export interface RiskResult {
  score: number;
  reasons: string[];
  minor: boolean;
}

export function riskScore(title: string | null, description: string | null): RiskResult {
  const text = `${title || ""}\n${description || ""}`;
  let score = 0;
  const reasons: string[] = [];

  if (FEE.test(text) && !FEE_NEGATE.test(text)) {
    score += 4;
    reasons.push("비용 징수 문맥");
    if (FEE_STRONG.test(text)) {
      score += 2;
      reasons.push("징수 강신호(입금·본인 부담)");
    }
  }
  if (ADULT.test(text)) {
    score += 4;
    reasons.push("성인·노출");
  }
  if (IDENTITY.test(text)) {
    score += 4;
    reasons.push("신분증·금융정보 요구");
  }
  if (HYPE.test(text)) {
    score += 3;
    reasons.push("과장 보상(데뷔·합격 보장)");
  }
  if (RISKY_CHANNEL.test(text)) {
    score += 2;
    reasons.push("위험 연락 채널");
  }
  if (UNPAID.test(text) && COMMERCIAL.test(text)) {
    score += 3;
    reasons.push("무급+상업 사용(착취 의심)");
  }
  const asks = (text.match(/프로필|사진|영상|연락처|이메일|지원/g) || []).length;
  if (asks >= 3 && !PRODUCER.test(text)) {
    score += 2;
    reasons.push("정보 비대칭(주체 불명+요구 과다)");
  }

  return { score, reasons, minor: MINOR.test(text) };
}
