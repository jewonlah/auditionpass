import test from "node:test";
import assert from "node:assert/strict";
import { claimFailure } from "./errors";
test("파일·문서·접수 변경과 영구 중지를 구분해 복구 행동을 안내한다", () => {
  assert.equal(claimFailure("FILE_OPERATION_PENDING").code, "FILE_OPERATION_PENDING");
  assert.match(claimFailure("FILE_OPERATION_PENDING").error, /support@/);
  assert.equal(claimFailure("PROFILE_CHANGED").code, "PROFILE_CHANGED");
  assert.equal(claimFailure("SEND_STOPPED").code, "SEND_STOPPED");
  assert.equal(claimFailure("database unavailable").code, "PREPARATION_CHANGED");
});
