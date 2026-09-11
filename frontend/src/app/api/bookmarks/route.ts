import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { AUDITION_LIST_COLUMNS } from "@/lib/audition/columns";

export async function GET(req: Request) {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const pageParam = new URL(req.url).searchParams.get("page");
  if (pageParam !== null) {
    const page = Math.max(0, Math.min(10000, Number(pageParam) || 0));
    const { data, error } = await db.from("bookmarks").select(`id,audition:auditions(${AUDITION_LIST_COLUMNS})`)
      .eq("user_id", user.id).order("audition(deadline)", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }).range(page * 20, page * 20 + 19);
    if (error) return NextResponse.json({ error: "찜한 공고를 불러오지 못했습니다." }, { status: 503 });
    return NextResponse.json({ bookmarks: data ?? [], hasMore: data?.length === 20 });
  }
  const ids: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("bookmarks").select("audition_id").eq("user_id", user.id)
      .order("id").range(offset, offset + 499);
    if (error) return NextResponse.json({ error: "찜 상태를 불러오지 못했습니다." }, { status: 503 });
    ids.push(...(data ?? []).map((row) => row.audition_id));
    if (!data || data.length < 500) break;
  }
  return NextResponse.json({ ids });
}

async function update(req: Request, remove: boolean) {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const parsed = z.object({ auditionId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "공고 정보를 확인해주세요." }, { status: 400 });
  const { auditionId } = parsed.data;
  const { error } = remove
    ? await db.from("bookmarks").delete().eq("user_id", user.id).eq("audition_id", auditionId)
    : await db.from("bookmarks").upsert({ user_id: user.id, audition_id: auditionId }, { onConflict: "user_id,audition_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: "찜 저장에 실패했습니다. 다시 시도해주세요." }, { status: 503 });
  return NextResponse.json({ saved: !remove });
}
export async function POST(req: Request) { return update(req, false); }
export async function DELETE(req: Request) { return update(req, true); }
