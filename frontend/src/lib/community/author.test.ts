import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthorName } from "./author";

test("user_id가 null이면 프로필 이름이 있어도 '탈퇴한 회원'이다", () => {
  assert.equal(resolveAuthorName(null, "나현석"), "탈퇴한 회원");
});

test("user_id가 있고 프로필 이름이 없으면 '익명'이다", () => {
  assert.equal(resolveAuthorName("user-1", null), "익명");
  assert.equal(resolveAuthorName("user-1", undefined), "익명");
});

test("user_id가 있고 프로필 이름이 있으면 그 이름을 쓴다", () => {
  assert.equal(resolveAuthorName("user-1", "나현석"), "나현석");
});
