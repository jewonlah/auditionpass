import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateProfilePdf, type SavedProfile } from "./pdf-storage";

const version = { id: "version1", user_id: "owner", profile: { name: "저장본" }, created_at: "2026-09-11T00:00:00Z" } as SavedProfile;
const rpc = async (name: string) => ({ data: name === "begin_account_file_operation" ? "operation1" : null, error: null });
test("저장된 PDF는 새로 렌더하지 않고 동일한 바이트를 반환한다", async () => {
  const original = Buffer.from("%PDF-persisted-exact-file");
  const db = { rpc, storage: { from: () => ({ download: async (path: string) => {
    assert.equal(path, "owner/version1.pdf");
    return { data: new Blob([original]), error: null };
  } }) } } as unknown as SupabaseClient;
  assert.deepEqual(await getOrCreateProfilePdf(db, version, "owner"), original);
});
test("소유자가 다르면 서비스 권한 파일 조회를 시작하지 않는다", async () => {
  await assert.rejects(getOrCreateProfilePdf({} as SupabaseClient, version, "other"), /권한/);
});
test("동시에 PDF를 생성하면 먼저 저장된 파일을 반환한다", async () => {
  let downloads = 0;
  const winner = Buffer.from("%PDF-first-request-won");
  const db = { rpc, storage: { from: () => ({
    download: async () => ++downloads === 1 ? { data: null, error: { message: "Object not found" } } : { data: new Blob([winner]), error: null },
    upload: async (_path: string, _bytes: Buffer, options: { upsert: boolean }) => {
      assert.equal(options.upsert, false);
      return { error: { message: "Already exists", statusCode: "409" } };
    },
  }) } } as unknown as SupabaseClient;
  assert.deepEqual(await getOrCreateProfilePdf(db, version, "owner"), winner);
});
