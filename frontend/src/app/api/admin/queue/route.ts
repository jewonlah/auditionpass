import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { fetchQueueItems } from "@/lib/admin/queue";

export async function GET() {
  try {
    const admin = await getAdminEmail();
    if (!admin) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const supabase = createAdminServiceClient();
    const items = await fetchQueueItems(supabase);

    // 최근 액션 로그 (undo 패널용) — 013 미적용 시 빈 배열로 강등
    const { data: recent, error: logError } = await supabase
      .from("admin_actions")
      .select("id, action, audition_id, audition_title, undone_by, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      items,
      recent: recent ?? [],
      logUnavailable: Boolean(logError),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "큐 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
