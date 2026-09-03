import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";

/**
 * GET /api/onboarding/recommended?genres=배우,모델
 *
 * 온보딩 Step3 "첫 추천" 전용 — 선택한 분야의 활성 공고 3건을 반환한다.
 * 매치가 3건 미만이면 전체 활성 공고로 채운다(데드엔드 금지, 12_ia-userflows §5 공통 규칙).
 */
const FIELDS =
  "id,title,company,genre,deadline,apply_type";
const LIMIT = 3;

interface RecommendedRow {
  id: string;
  title: string;
  company: string | null;
  genre: string;
  deadline: string | null;
  apply_type: "email" | "external";
}

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const genres = (searchParams.get("genres") ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const today = todayKST();
  const activeFilter = `deadline.gte.${today},deadline.is.null`;

  let matched: RecommendedRow[] = [];
  if (genres.length > 0) {
    const { data, error } = await supabase
      .from("auditions")
      .select(FIELDS)
      .eq("is_active", true)
      .or(activeFilter)
      .in("genre", genres)
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(LIMIT);
    if (error) {
      return NextResponse.json({ error: "추천 공고 조회 실패" }, { status: 500 });
    }
    matched = (data as RecommendedRow[] | null) ?? [];
  }

  if (matched.length < LIMIT) {
    const { data: fallback, error } = await supabase
      .from("auditions")
      .select(FIELDS)
      .eq("is_active", true)
      .or(activeFilter)
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(LIMIT * 2);
    if (error) {
      return NextResponse.json({ error: "추천 공고 조회 실패" }, { status: 500 });
    }
    const seen = new Set(matched.map((a) => a.id));
    for (const row of (fallback as RecommendedRow[] | null) ?? []) {
      if (matched.length >= LIMIT) break;
      if (seen.has(row.id)) continue;
      matched.push(row);
      seen.add(row.id);
    }
  }

  return NextResponse.json({ auditions: matched.slice(0, LIMIT) });
}
