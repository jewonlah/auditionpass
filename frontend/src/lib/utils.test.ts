import test from "node:test";
import assert from "node:assert/strict";
import { unwrapOnboardingReturnTo } from "./utils";

test("중첩 없음 — /onboarding이 아니면 그대로 반환", () => {
  assert.equal(unwrapOnboardingReturnTo("/audition/123?apply=1"), "/audition/123?apply=1");
  assert.equal(unwrapOnboardingReturnTo("/home"), "/home");
});

test("1단 중첩을 풀어 실제 목적지를 반환", () => {
  const nested = `/onboarding?returnTo=${encodeURIComponent("/audition/123?apply=1")}`;
  assert.equal(unwrapOnboardingReturnTo(nested), "/audition/123?apply=1");
});

test("2단 중첩도 재귀적으로 풀어 실제 목적지까지 도달한다", () => {
  const inner = `/onboarding?returnTo=${encodeURIComponent("/audition/123?apply=1")}`;
  const outer = `/onboarding?returnTo=${encodeURIComponent(inner)}`;
  assert.equal(unwrapOnboardingReturnTo(outer), "/audition/123?apply=1");
});

test("returnTo 없이 /onboarding만 남으면 /home으로 떨어진다", () => {
  assert.equal(unwrapOnboardingReturnTo("/onboarding"), "/home");
  assert.equal(unwrapOnboardingReturnTo("/onboarding?foo=bar"), "/home");
});
