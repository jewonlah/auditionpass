// 탈퇴 삭제 순서 회귀 테스트.
// 순서가 틀리면 (a) 스토리지 파일이 주인 없이 영구히 남거나
// (b) 계정만 먼저 사라져 나머지를 지울 권한 확인이 불가능해진다. 둘 다 복구 불가.

import test from "node:test";
import assert from "node:assert/strict";
import { buildDeletionPlan } from "./deletion-plan";

test("삭제 순서가 정본과 일치한다", () => {
  assert.deepEqual(
    buildDeletionPlan().map((s) => s.key),
    [
      "storage_profiles",
      "bookmarks",
      "applications",
      "community_likes",
      "community_comments",
      "community_posts",
      "reports",
      "profiles",
      "auth_user",
    ]
  );
});

test("스토리지 삭제가 auth.users 삭제보다 먼저다 (FK CASCADE 밖이라 나중이면 고아 파일)", () => {
  const keys = buildDeletionPlan().map((s) => s.key);
  assert.ok(keys.indexOf("storage_profiles") < keys.indexOf("auth_user"));
});

test("auth.users 삭제는 언제나 마지막 단계다", () => {
  const plan = buildDeletionPlan();
  const last = plan[plan.length - 1];
  assert.equal(last.key, "auth_user");
  assert.equal(last.mode, "auth");
  assert.equal(plan.filter((s) => s.mode === "auth").length, 1);
});

test("커뮤니티 글·댓글은 삭제가 아니라 비공개 처리다", () => {
  const plan = buildDeletionPlan();
  for (const key of ["community_posts", "community_comments"]) {
    const step = plan.find((s) => s.key === key);
    assert.ok(step, `${key} 단계 누락`);
    assert.equal(step.mode, "soft_delete");
    assert.equal(step.column, "user_id");
  }
});

test("신고 이력은 직접 지우지 않는다 (FK SET NULL 익명화 — reports_count 무결성)", () => {
  const step = buildDeletionPlan().find((s) => s.key === "reports");
  assert.ok(step);
  assert.equal(step.mode, "fk_anonymize");
  assert.equal(step.executed, false);
});

test("profiles 는 auth.users 보다 먼저 지운다", () => {
  const keys = buildDeletionPlan().map((s) => s.key);
  assert.ok(keys.indexOf("profiles") < keys.indexOf("auth_user"));
});

test("실행 단계는 모두 식별 컬럼 또는 전용 모드를 갖는다", () => {
  for (const step of buildDeletionPlan()) {
    if (!step.executed) continue;
    const needsColumn = step.mode === "delete" || step.mode === "soft_delete";
    assert.equal(
      needsColumn,
      Boolean(step.column),
      `${step.key}: delete/soft_delete 단계에만 column 이 있어야 한다`
    );
    assert.ok(step.label.length > 0, `${step.key}: 사용자 노출 단계명 필요`);
  }
});

test("계획에 폐지 개념 테이블이 없다 (daily_apply_count·결제)", () => {
  const targets = buildDeletionPlan().map((s) => s.target);
  assert.ok(!targets.includes("daily_apply_count"));
  assert.ok(!targets.some((t) => t.startsWith("payment")));
});
