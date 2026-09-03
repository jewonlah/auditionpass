// 인메모리 속도 제한 회귀 테스트 (node --test).

import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, resetRateLimit } from "./rate-limit";

const RULES = [
  { limit: 3, windowMs: 60_000, label: "1분에" },
  { limit: 5, windowMs: 3_600_000, label: "1시간에" },
];

test("한도까지는 통과, 넘으면 429용 결과를 준다", () => {
  resetRateLimit("u1");
  for (let i = 0; i < 3; i++) assert.equal(checkRateLimit("u1", RULES).ok, true, `#${i}`);
  const blocked = checkRateLimit("u1", RULES);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.ok(blocked.message?.includes("1분에"), blocked.message);
});

test("초과 요청은 기록되지 않는다 (영구 차단 방지)", () => {
  resetRateLimit("u2");
  const short = [{ limit: 1, windowMs: 50, label: "잠깐" }];
  assert.equal(checkRateLimit("u2", short).ok, true);
  assert.equal(checkRateLimit("u2", short).ok, false);
  assert.equal(checkRateLimit("u2", short).ok, false);
  return new Promise<void>((resolve) =>
    setTimeout(() => {
      assert.equal(checkRateLimit("u2", short).ok, true);
      resolve();
    }, 70)
  );
});

test("사용자마다 카운터가 분리된다", () => {
  resetRateLimit();
  for (let i = 0; i < 3; i++) checkRateLimit("a", RULES);
  assert.equal(checkRateLimit("a", RULES).ok, false);
  assert.equal(checkRateLimit("b", RULES).ok, true);
});

test("긴 윈도 한도(시간당)도 걸린다", () => {
  resetRateLimit("u3");
  const rules = [
    { limit: 10, windowMs: 60_000, label: "1분에" },
    { limit: 2, windowMs: 3_600_000, label: "1시간에" },
  ];
  assert.equal(checkRateLimit("u3", rules).ok, true);
  assert.equal(checkRateLimit("u3", rules).ok, true);
  const blocked = checkRateLimit("u3", rules);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.message?.includes("1시간에"), blocked.message);
});
