// 신뢰 배지 3단계 회귀 테스트 (36 §4).
// 유저에게 직접 보이는 안전 신호라 오판이 곧 잘못된 안심으로 이어진다.

import test from "node:test";
import assert from "node:assert/strict";
import { getTrustBadge, type TrustInput } from "./trust";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function input(over: Partial<TrustInput> = {}): TrustInput {
  return {
    review_status: "auto",
    created_at: daysAgo(30),
    reports_count: 0,
    oneclick_blocked: false,
    apply_email: "cast@example.com",
    source_url: "https://example.com/1",
    ...over,
  };
}

test("운영자 승인 공고는 검수 완료", () => {
  const b = getTrustBadge(input({ review_status: "approved" }));
  assert.equal(b.level, "reviewed");
  assert.ok(b.hint.includes("안전을 보장하지는 않습니다"), "고지 문구 필수");
});

test("자동 게재 + 7일 경과 + 무신고면 출처 확인", () => {
  assert.equal(getTrustBadge(input()).level, "source_verified");
});

test("자동 게재라도 7일 미만이면 주의 필요", () => {
  assert.equal(getTrustBadge(input({ created_at: daysAgo(3) })).level, "caution");
});

test("신고가 있으면 승인 공고라도 주의 필요", () => {
  const b = getTrustBadge(input({ review_status: "approved", reports_count: 1 }));
  assert.equal(b.level, "caution");
});

test("원클릭 차단된 공고는 주의 필요", () => {
  assert.equal(getTrustBadge(input({ oneclick_blocked: true })).level, "caution");
});

test("이메일·원문이 모두 없으면 주의 필요", () => {
  const b = getTrustBadge(input({ apply_email: null, source_url: null }));
  assert.equal(b.level, "caution");
});

test("이메일만 없고 원문이 있으면 사이트 지원 공고 — 그 이유로 주의 필요가 되지는 않는다", () => {
  assert.equal(getTrustBadge(input({ apply_email: null })).level, "source_verified");
});

test("어떤 배지도 '검증됨' 같은 보증 표현을 쓰지 않는다 (36 §3)", () => {
  for (const over of [
    { review_status: "approved" },
    { review_status: "auto" },
    { reports_count: 1 },
  ]) {
    const b = getTrustBadge(input(over as Partial<TrustInput>));
    assert.ok(!/검증|보장됨|안전함/.test(b.label), `금지 표현: ${b.label}`);
  }
});

test("015 미적용(필드 undefined)에서도 판정이 깨지지 않는다", () => {
  const i = input();
  delete i.reports_count;
  delete i.oneclick_blocked;
  assert.equal(getTrustBadge(i).level, "source_verified");
});
