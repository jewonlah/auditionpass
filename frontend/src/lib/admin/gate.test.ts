// 승인 게이트 회귀 테스트 (node --test, 의존성 없음)
// 2026-08-26 Codex 교차 리뷰에서 나온 실제 결함을 케이스로 고정한다.
// 게이트는 UI가 아니라 서버가 강제하는 안전장치라 조용히 깨지면 위험 공고가 게시된다.

import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGate, type AdminAuditionRow } from "./gate";

const KST_TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const PAST = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);

// 아무 플래그도 걸리지 않는 정상 공고
function row(over: Partial<AdminAuditionRow> = {}): AdminAuditionRow {
  return {
    id: "a1",
    title: "뮤지컬 〈시작〉 배우 모집",
    company: "제작사 A",
    genre: "배우",
    category: "뮤지컬",
    deadline: FUTURE,
    apply_email: "cast@example.com",
    description: "제작사에서 배우를 모집합니다. 출연료는 회차당 지급합니다.",
    requirements: "프로필",
    source_url: "https://example.com/1",
    source_name: "콘테스트코리아",
    quality_score: 0.9,
    review_status: "pending",
    is_active: false,
    created_at: new Date().toISOString(),
    ...over,
  };
}

const clean = { trusted: true, dedup: [] };

test("신뢰 출처 + 위험 없음 + 무충돌이면 SAFE", () => {
  assert.equal(evaluateGate(row(), clean).decision, "SAFE");
});

test("사이트 지원 공고(이메일 없음, 원문 URL 있음)는 BLOCKED가 아니다", () => {
  // Codex P1: 이걸 막으면 외부 지원 공고 전체가 큐에 영구히 쌓인다
  const g = evaluateGate(row({ apply_email: null }), clean);
  assert.notEqual(g.decision, "BLOCKED");
  assert.ok(g.checkReasons.some((r) => r.includes("사이트 지원")));
});

test("원문 URL이 없으면 BLOCKED", () => {
  const g = evaluateGate(row({ source_url: null }), clean);
  assert.equal(g.decision, "BLOCKED");
  assert.ok(g.blockedReasons.some((r) => r.includes("공개 출처 없음")));
});

test("격리 상태는 BLOCKED", () => {
  const g = evaluateGate(row({ review_status: "quarantine" }), clean);
  assert.equal(g.decision, "BLOCKED");
});

test("심각 신고로 원클릭 차단된 공고는 BLOCKED (일괄 승인에 쓸려 들어가면 안 됨)", () => {
  const g = evaluateGate(row({ oneclick_blocked: true }), clean);
  assert.equal(g.decision, "BLOCKED");
});

test("suppression 히트는 BLOCKED", () => {
  const g = evaluateGate(row(), { ...clean, suppressionHit: "email:spam@x.com" });
  assert.equal(g.decision, "BLOCKED");
});

test("마감이 없거나 지났으면 BLOCKED", () => {
  assert.equal(evaluateGate(row({ deadline: null }), clean).decision, "BLOCKED");
  assert.equal(evaluateGate(row({ deadline: PAST }), clean).decision, "BLOCKED");
  // 오늘 마감은 아직 유효
  assert.notEqual(evaluateGate(row({ deadline: KST_TODAY }), clean).decision, "BLOCKED");
});

test("금전 요구가 감지되면 BLOCKED", () => {
  const g = evaluateGate(
    row({ description: "참가비 5만원을 입금해 주세요." }),
    clean
  );
  assert.equal(g.decision, "BLOCKED");
  assert.ok(g.blockedReasons.some((r) => r.includes("금전 요구")));
});

test("게재 중 공고와 마감이 같은 dedup 충돌은 BLOCKED", () => {
  const g = evaluateGate(row(), {
    trusted: true,
    dedup: [{ id: "b1", title: "같은 공고", review_status: "approved", deadline: FUTURE }],
  });
  assert.equal(g.decision, "BLOCKED");
});

test("마감이 다른 중복 후보는 BLOCKED가 아니라 CHECK", () => {
  const g = evaluateGate(row(), {
    trusted: true,
    dedup: [{ id: "b1", title: "다른 회차", review_status: "approved", deadline: PAST }],
  });
  assert.equal(g.decision, "CHECK");
});

test("신고 이력이 있으면 CHECK", () => {
  const g = evaluateGate(row({ reports_count: 2 }), clean);
  assert.equal(g.decision, "CHECK");
  assert.ok(g.checkReasons.some((r) => r.includes("신고 2건")));
});

test("미신뢰 출처는 CHECK", () => {
  const g = evaluateGate(row(), { trusted: false, dedup: [] });
  assert.equal(g.decision, "CHECK");
});

test("요약본이 아니라 원문(description_raw)으로 위험을 판정한다", () => {
  // 021 이전의 실제 사고 시나리오: 요약이 징수 문장을 통째로 날려 스캠이 SAFE로 통과했다
  const g = evaluateGate(
    row({
      description: "• 배역: 신인 배우\n• 지원: 이메일",
      description_raw: "신인 배우 모집. 참가비 20만원을 입금해 주세요.",
    }),
    clean
  );
  assert.equal(g.decision, "BLOCKED");
  assert.ok(g.blockedReasons.some((r) => r.includes("금전 요구")));
});

test("requirements에만 적힌 위험 신호도 판정에 들어간다", () => {
  const g = evaluateGate(
    row({ requirements: "지원 시 신분증 사본과 통장 사본을 함께 보내주세요." }),
    clean
  );
  assert.notEqual(g.decision, "SAFE");
  assert.ok(g.risk.reasons.includes("신분증·금융정보 요구"));
});

test("description_raw가 없으면 description으로 폴백한다 (021 미적용·기존 행)", () => {
  const r = row({ description: "참가비 5만원 입금 후 오디션 진행합니다." });
  delete (r as Partial<AdminAuditionRow>).description_raw;
  const g = evaluateGate(r, clean);
  assert.equal(g.decision, "BLOCKED");
  assert.ok(g.blockedReasons.some((r2) => r2.includes("금전 요구")));
});

test("015 미적용(컬럼 undefined)에서도 판정이 깨지지 않는다", () => {
  const r = row();
  delete (r as Partial<AdminAuditionRow>).oneclick_blocked;
  delete (r as Partial<AdminAuditionRow>).reports_count;
  assert.equal(evaluateGate(r, clean).decision, "SAFE");
});
