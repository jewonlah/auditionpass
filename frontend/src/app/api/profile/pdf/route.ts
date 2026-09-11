import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getOrCreateProfilePdf, type SavedProfile } from "@/lib/profile/pdf-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("versionId");
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "저장한 프로필을 선택해주세요." }, { status: 400 });
  const { data: version, error } = await db.from("profile_versions").select("id,user_id,profile,created_at")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "프로필 조회에 실패했습니다." }, { status: 503 });
  if (!version) return NextResponse.json({ error: "프로필을 찾을 수 없습니다." }, { status: 404 });
  try {
    const bytes = await getOrCreateProfilePdf(createServiceRoleClient(), version as SavedProfile, user.id);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="profile.pdf"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return NextResponse.json({ error: "PDF를 준비하지 못했습니다. 등록한 사진을 확인하거나 잠시 후 다시 시도해주세요." }, { status: 503 });
  }
}
