import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";

// 공고 검색 (R1b 긴급 조치 표면): 제목/이메일/출처로 찾아서 게시중지·격리.
export async function GET(req: Request) {
  try {
    const admin = await getAdminEmail();
    if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = url.searchParams.get("status") ?? "active";

    const supabase = createAdminServiceClient();
    let query = supabase
      .from("auditions")
      .select(
        "id, title, source_name, deadline, apply_email, review_status, is_active, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (status === "active") query = query.eq("is_active", true);
    else if (status !== "all") query = query.eq("review_status", status);

    if (q) {
      const safe = q.replaceAll(",", " ").replaceAll("%", "");
      query = query.or(
        `title.ilike.%${safe}%,apply_email.ilike.%${safe}%,source_name.ilike.%${safe}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: `검색 실패: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "검색 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
