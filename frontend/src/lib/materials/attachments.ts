import type { SupabaseClient } from "@supabase/supabase-js";
import { MATERIAL_BUCKET, MAX_MATERIAL_BYTES } from "./files";

export const MAX_APPLICATION_MATERIALS = 3;
export async function loadMaterialAttachments(db: SupabaseClient, userId: string, ids: string[]) {
  if (ids.length > MAX_APPLICATION_MATERIALS || new Set(ids).size !== ids.length) throw new Error("추가 첨부는 서로 다른 자료 3개까지 선택해 주세요.");
  if (!ids.length) return [];
  const { data, error } = await db.from("materials").select("id,user_id,name,storage_path,size_bytes").eq("user_id", userId).in("id", ids);
  if (error || data?.length !== ids.length) throw new Error("선택한 자료가 삭제되었거나 불러올 수 없어요. 자료를 다시 선택해 주세요.");
  // Load exact owned bytes now: retries use the persisted delivery payload even if the library changes.
  const attachments = [];
  for (const id of ids) {
    const row = data.find((item) => item.id === id);
    if (!row || row.user_id !== userId || !row.storage_path.startsWith(`${userId}/${id}.`) || row.size_bytes > MAX_MATERIAL_BYTES) throw new Error("첨부할 자료의 소유자와 크기를 확인하지 못했어요.");
    const downloaded = await db.storage.from(MATERIAL_BUCKET).download(row.storage_path);
    if (downloaded.error || !downloaded.data || downloaded.data.size !== row.size_bytes) throw new Error("첨부 파일을 읽지 못했어요. 보관함에서 파일을 확인해 주세요.");
    attachments.push({ filename: `${attachments.length + 1}_${row.name}`, content: Buffer.from(await downloaded.data.arrayBuffer()).toString("base64") });
  }
  return attachments;
}
