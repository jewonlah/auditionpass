import type { SupabaseClient } from "@supabase/supabase-js";

type FileWrite = { startWrite(): void; finishWrite(): void };

/** Durable tokens serialize account deletion against file operations across servers. */
export async function withAccountFileOperation<T>(
  db: SupabaseClient,
  userId: string,
  work: (write: FileWrite) => Promise<T>,
): Promise<T> {
  const { data: operationId, error } = await db.rpc("begin_account_file_operation", { p_user_id: userId });
  if (error || typeof operationId !== "string" || !operationId) throw Error("파일 처리를 시작하지 못했습니다.");
  let uncertainWrite = false;
  try {
    return await work({
      startWrite() { uncertainWrite = true; },
      finishWrite() { uncertainWrite = false; },
    });
  } finally {
    // A timeout may leave an upload running remotely. Never expire its token automatically.
    if (!uncertainWrite) {
      try {
        const { error: releaseError } = await db.rpc("finish_account_file_operation", {
          p_user_id: userId, p_operation_id: operationId,
        });
        if (releaseError) console.error("[files] operation release failed", { operationId });
      } catch {
        console.error("[files] operation release failed", { operationId });
      }
    } else {
      console.error("[files] upload requires reconciliation", { operationId });
    }
  }
}

export async function beginAccountFileDeletion(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.rpc("begin_account_file_deletion", { p_user_id: userId });
  if (error || typeof data !== "boolean") throw Error("파일 처리 상태를 확인하지 못했습니다.");
  return data;
}
