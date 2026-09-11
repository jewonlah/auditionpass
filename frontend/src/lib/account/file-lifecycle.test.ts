import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beginAccountFileDeletion, withAccountFileOperation } from "./file-lifecycle";

function fixture() {
  let deleting = false;
  const tokens = new Set<string>();
  const db = { rpc: async (name: string, args: Record<string, string>) => {
    if (name === "begin_account_file_deletion") {
      deleting = true;
      return { data: tokens.size === 0, error: null };
    }
    if (name === "begin_account_file_operation") {
      if (deleting) return { data: null, error: { message: "deleting" } };
      const id = crypto.randomUUID(); tokens.add(id);
      return { data: id, error: null };
    }
    tokens.delete(args.p_operation_id);
    return { data: null, error: null };
  } } as unknown as SupabaseClient;
  return { db, tokens };
}

test("진행 중 파일 작업은 탈퇴를 막고, 탈퇴 요청 뒤에는 새 작업을 시작하지 않는다", async () => {
  const { db, tokens } = fixture();
  let resume!: () => void;
  let started!: () => void;
  const working = new Promise<void>((resolve) => { started = resolve; });
  const pause = new Promise<void>((resolve) => { resume = resolve; });
  const operation = withAccountFileOperation(db, "owner", async (write) => {
    write.startWrite(); started(); await pause; write.finishWrite(); return "stored";
  });
  await working;
  assert.equal(await beginAccountFileDeletion(db, "owner"), false);
  await assert.rejects(withAccountFileOperation(db, "owner", async () => assert.fail("must not run")));
  resume(); assert.equal(await operation, "stored");
  assert.equal(tokens.size, 0);
  assert.equal(await beginAccountFileDeletion(db, "owner"), true);
});

test("업로드 결과를 알 수 없으면 토큰을 유지해 늦은 업로드와 삭제가 겹치지 않는다", async () => {
  const { db, tokens } = fixture();
  await assert.rejects(withAccountFileOperation(db, "owner", async (write) => {
    write.startWrite(); throw Error("network timeout");
  }), /network timeout/);
  assert.equal(tokens.size, 1);
  assert.equal(await beginAccountFileDeletion(db, "owner"), false);
});

test("업로드 시작 전 렌더 실패는 탈퇴를 막지 않는다", async () => {
  const { db } = fixture();
  await assert.rejects(withAccountFileOperation(db, "owner", async () => { throw Error("render failed"); }));
  assert.equal(await beginAccountFileDeletion(db, "owner"), true);
});

test("작업 해제 실패는 성공한 저장 결과를 바꾸지 않고 탈퇴를 보수적으로 막는다", async () => {
  let pending = false;
  const db = { rpc: async (name: string) => {
    if (name === "begin_account_file_operation") { pending = true; return { data: "operation", error: null }; }
    if (name === "finish_account_file_operation") throw Error("connection lost");
    return { data: !pending, error: null };
  } } as unknown as SupabaseClient;
  assert.equal(await withAccountFileOperation(db, "owner", async (write) => {
    write.startWrite(); write.finishWrite(); return "stored";
  }), "stored");
  assert.equal(await beginAccountFileDeletion(db, "owner"), false);
});

test("상태 확인 RPC 실패 시 삭제를 허용하지 않는다", async () => {
  const db = { rpc: async () => ({ data: null, error: { message: "unavailable" } }) } as unknown as SupabaseClient;
  await assert.rejects(beginAccountFileDeletion(db, "owner"));
});
