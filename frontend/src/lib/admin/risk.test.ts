// risk 포팅 회귀 테스트.
// crawler/utils/risk.py와 규칙을 이중 유지하므로 한쪽만 바뀌면 여기서 깨져야 한다.
// (파이썬이 격리한 공고를 웹 게이트가 통과시키면 위험 공고가 게시된다)

import test from "node:test";
import assert from "node:assert/strict";
import { riskScore } from "./risk";

test("정상 공고는 0점", () => {
  const r = riskScore("뮤지컬 배우 모집", "제작사에서 배우를 모집합니다. 출연료 지급.");
  assert.equal(r.score, 0);
  assert.deepEqual(r.reasons, []);
});

test("참가비 요구는 비용 징수 4점, 입금까지 있으면 +2", () => {
  assert.equal(riskScore("모델 모집", "참가비 3만원").score, 4);
  const strong = riskScore("모델 모집", "참가비 3만원을 입금해 주세요");
  assert.equal(strong.score, 6);
  assert.ok(strong.reasons.includes("징수 강신호(입금·본인 부담)"));
});

test("'참가비 없음'은 비용 징수로 세지 않는다", () => {
  const r = riskScore("배우 모집", "참가비는 일체 없습니다. 제작사 부담.");
  assert.ok(!r.reasons.includes("비용 징수 문맥"));
});

test("신분증·통장 요구는 4점", () => {
  const r = riskScore("모델 모집", "신분증 사본과 통장 사본을 보내주세요");
  assert.ok(r.reasons.includes("신분증·금융정보 요구"));
  assert.ok(r.score >= 4);
});

test("노출·성인 문구는 4점", () => {
  assert.ok(riskScore("화보 촬영", "노출 있습니다").reasons.includes("성인·노출"));
});

test("위험 점수 7 이상이면 격리 기준(크롤러와 동일)", () => {
  // 참가비(4) + 입금(2) + 텔레그램(2) = 8
  const r = riskScore("고수익 알바", "참가비 입금 후 텔레그램으로 연락 주세요");
  assert.ok(r.score >= 7, `기대: 7 이상, 실제: ${r.score}`);
});

test("무급 + 상업 사용 조합만 착취로 센다", () => {
  assert.ok(
    riskScore("모델 모집", "무급입니다. 광고에 사용됩니다.").reasons.includes(
      "무급+상업 사용(착취 의심)"
    )
  );
  assert.ok(
    !riskScore("단편영화", "무급 독립영화입니다.").reasons.includes(
      "무급+상업 사용(착취 의심)"
    )
  );
});

test("미성년 감지 — 격리 조합 판정의 입력", () => {
  assert.equal(riskScore("아역 모델 모집", "6세~10세").minor, true);
  assert.equal(riskScore("성인 배우 모집", "20대").minor, false);
});

test("제작 주체가 없고 요구만 많으면 정보 비대칭 가산", () => {
  const r = riskScore("모집", "프로필 사진 영상 연락처 이메일 지원 바랍니다");
  assert.ok(r.reasons.includes("정보 비대칭(주체 불명+요구 과다)"));
});
