import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { withAccountFileOperation } from "@/lib/account/file-lifecycle";
import { hasMaterialSignature, materialFileError, MATERIAL_BUCKET, MATERIAL_COLUMNS, MATERIAL_TYPES, MAX_MATERIAL_BYTES } from "@/lib/materials/files";

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET() {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("로그인이 필요해요.", 401);
  const { data, error } = await db.from("materials").select(MATERIAL_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (error) return fail("자료를 불러오지 못했어요. 다시 시도해 주세요.", 503);
  return NextResponse.json({ materials: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("로그인이 필요해요.", 401);
  // Bound the complete multipart body, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return fail("파일을 선택해 주세요.", 400);
  let form: FormData;
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MATERIAL_BYTES + 64 * 1024) { await reader.cancel(); return fail("파일당 3MB까지 올릴 수 있어요.", 413); }
      chunks.push(new Uint8Array(value));
    }
    form = await new Response(new Blob(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  } catch { return fail("업로드 요청을 읽지 못했어요. 다시 선택해 주세요.", 400); }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("파일을 선택해 주세요.", 400);
  const invalid = materialFileError(file);
  if (invalid) return fail(invalid, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasMaterialSignature(bytes, file.type)) return fail("파일 내용과 형식이 맞지 않아요. 원본 파일을 확인해 주세요.", 400);
  const id = crypto.randomUUID();
  const type = MATERIAL_TYPES[file.type];
  const path = `${user.id}/${id}.${type.extension}`;
  try {
    const admin = createServiceRoleClient();
    return await withAccountFileOperation(admin, user.id, async (write) => {
      // Publish the row only after the upload completes: another tab cannot delete an in-flight object.
      write.startWrite();
      const uploaded = await admin.storage.from(MATERIAL_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
      if (uploaded.error) {
        // Leave the operation token when remote completion is uncertain, matching existing lifecycle rules.
        return fail("파일을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", 503);
      }
      write.finishWrite();
      const { data, error } = await admin.from("materials").insert({ id, user_id: user.id, name: file.name.trim(), kind: type.kind, mime_type: file.type, size_bytes: file.size, storage_path: path }).select(MATERIAL_COLUMNS).single();
      if (error) {
        const cleanup = await admin.storage.from(MATERIAL_BUCKET).remove([path]);
        if (cleanup.error) console.error("[materials] orphan cleanup required", { path });
        return fail(error.code === "23514" ? "자료는 100개까지 보관할 수 있어요. 필요 없는 자료를 삭제해 주세요." : "자료를 저장하지 못했어요. 다시 시도해 주세요.", error.code === "23514" ? 409 : 503);
      }
      return NextResponse.json({ material: data }, { status: 201 });
    });
  } catch { return fail("파일 처리를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}
