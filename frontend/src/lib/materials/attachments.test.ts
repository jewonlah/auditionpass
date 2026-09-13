import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMaterialAttachments } from "./attachments";
const owner = "owner";
const row = { id: "one", user_id: owner, name: "연기.pdf", storage_path: "owner/one.pdf", size_bytes: 3 };
function fake(rows: typeof row[], bytes = new Blob(["abc"])) {
  const query = { select: () => query, eq: (_field: string, id: string) => { assert.equal(id, owner); return query; }, in: async () => ({ data: rows, error: null }) };
  return { from: () => query, storage: { from: () => ({ download: async () => ({ data: bytes, error: null }) }) } } as unknown as SupabaseClient;
}
test("선택한 소유 자료의 바이트를 메일 재시도용 스냅샷으로 만든다", async () => {
  const attachments = await loadMaterialAttachments(fake([row]), owner, ["one"]);
  assert.equal(attachments[0].filename, "1_연기.pdf");
  assert.equal(Buffer.from(attachments[0].content, "base64").toString(), "abc");
});
test("삭제된 자료·다른 소유자·변경된 파일·중복·과다 선택은 발송 전에 차단한다", async () => {
  await assert.rejects(loadMaterialAttachments(fake([]), owner, ["one"]));
  await assert.rejects(loadMaterialAttachments(fake([{ ...row, user_id: "other" }]), owner, ["one"]));
  await assert.rejects(loadMaterialAttachments(fake([row], new Blob(["changed"])), owner, ["one"]));
  await assert.rejects(loadMaterialAttachments(fake([row]), owner, ["one", "one"]));
  await assert.rejects(loadMaterialAttachments(fake([row]), owner, ["1", "2", "3", "4"]));
  assert.deepEqual(await loadMaterialAttachments(fake([]), owner, []), []);
});
