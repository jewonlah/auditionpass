import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { withAccountFileOperation } from "@/lib/account/file-lifecycle";
import { MATERIAL_BUCKET } from "@/lib/materials/files";

type Context = { params: Promise<{ id: string }> };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

async function ownedMaterial(id: string) {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { response: fail("로그인이 필요해요.", 401) };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { response: fail("자료를 찾을 수 없어요.", 404) };
  const { data, error } = await db.from("materials").select("id,name,storage_path").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return { response: fail("자료를 불러오지 못했어요.", 503) };
  if (!data || !data.storage_path.startsWith(`${user.id}/${id}.`)) return { response: fail("자료를 찾을 수 없어요.", 404) };
  return { user, material: data };
}

export async function GET(_request: Request, context: Context) {
  const owned = await ownedMaterial((await context.params).id);
  if (owned.response) return owned.response;
  try {
    const { data, error } = await createServiceRoleClient().storage.from(MATERIAL_BUCKET).createSignedUrl(owned.material.storage_path, 60, { download: owned.material.name });
    if (error || !data) return fail("다운로드를 준비하지 못했어요. 다시 시도해 주세요.", 503);
    return NextResponse.json({ url: data.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return fail("다운로드를 준비하지 못했어요.", 503); }
}

export async function DELETE(_request: Request, context: Context) {
  const owned = await ownedMaterial((await context.params).id);
  if (owned.response) return owned.response;
  try {
    const admin = createServiceRoleClient();
    return await withAccountFileOperation(admin, owned.user.id, async () => {
      const { error: fileError } = await admin.storage.from(MATERIAL_BUCKET).remove([owned.material.storage_path]);
      if (fileError) return fail("파일을 삭제하지 못했어요. 다시 시도해 주세요.", 503);
      const { error } = await admin.from("materials").delete().eq("id", owned.material.id).eq("user_id", owned.user.id);
      if (error) return fail("목록 정리를 마치지 못했어요. 삭제를 다시 눌러 주세요.", 503);
      return NextResponse.json({ success: true });
    });
  } catch { return fail("삭제하지 못했어요. 잠시 후 다시 시도해 주세요.", 503); }
}
