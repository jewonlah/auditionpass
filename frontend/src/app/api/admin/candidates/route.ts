import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";

// 소스 후보(source_candidates) 검수 API — 020 마이그레이션의 ai_* 컬럼을 함께 노출한다.
// AI 판정은 제안일 뿐이고, status 변경은 이 엔드포인트(=사람의 클릭)로만 일어난다.

const ALLOWED_STATUS = new Set(["approved", "rejected"]);
// 한 번에 처리 가능한 상한 — 실수로 전량이 넘어가는 것을 막는다
const MAX_BULK = 200;

// 블로그 출처 키 = 블로그 ID (crawler/sns_sources/naver_web.py:_blog_key 와 동일 규칙).
// 세 곳(크롤러·이 API·tools/promote_candidates.py)이 같은 키를 만들어야 승인이 수집으로 이어진다.
const BLOG_ID_RE = /blog\.naver\.com\/([A-Za-z0-9_-]+)/;

function blogSourceName(url: string): string | null {
  const m = BLOG_ID_RE.exec(url ?? "");
  return m ? `네이버블로그:${m[1]}` : null;
}

export async function GET(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const url = new URL(req.url);
  const verdict = url.searchParams.get("verdict"); // approve | reject | review | (전체)
  const kind = url.searchParams.get("kind");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 300), 600);

  const supabase = createAdminServiceClient();
  let q = supabase
    .from("source_candidates")
    .select(
      "id,url,kind,found_by,hits,sample_title,first_seen,last_seen,ai_verdict,ai_source_type,ai_reason,ai_risk,covered_by"
    )
    .eq("status", "new")
    .order("hits", { ascending: false })
    .limit(limit);
  if (verdict) q = q.eq("ai_verdict", verdict);
  if (kind) q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: `조회 실패 (020 마이그레이션 적용 확인): ${error.message}` },
      { status: 500 }
    );
  }

  // 상단 요약 — 판정별·종류별 잔여 건수. kind 필터가 걸려 있으면 그 안에서 센다.
  let sumQ = supabase
    .from("source_candidates")
    .select("ai_verdict,kind,covered_by")
    .eq("status", "new")
    .limit(2000);
  if (kind) sumQ = sumQ.eq("kind", kind);
  const { data: all } = await sumQ;

  const counts = { approve: 0, reject: 0, review: 0, unclassified: 0, covered: 0, total: all?.length ?? 0 };
  const kinds: Record<string, number> = {};
  for (const r of all ?? []) {
    const v = r.ai_verdict as "approve" | "reject" | "review" | null;
    if (v === "approve" || v === "reject" || v === "review") counts[v] += 1;
    else counts.unclassified += 1;
    if (r.covered_by) counts.covered += 1;
    const k = (r.kind as string) || "기타";
    kinds[k] = (kinds[k] ?? 0) + 1;
  }

  return NextResponse.json({ items: data ?? [], counts, kinds });
}

export async function POST(req: Request) {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const body = (await req.json()) as { ids?: string[]; status?: string; expectedCount?: number };
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : null;
  const status = body.status;

  if (!ids?.length || !status || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: "ids·status(approved|rejected)가 필요합니다." }, { status: 400 });
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json({ error: `한 번에 ${MAX_BULK}건까지만 처리합니다.` }, { status: 400 });
  }
  // 화면에서 본 건수와 일치할 때만 진행 (bulk-approve 와 동일한 안전장치)
  if (typeof body.expectedCount === "number" && ids.length !== body.expectedCount) {
    return NextResponse.json(
      { error: "화면 목록과 건수가 다릅니다. 새로고침 후 다시 시도하세요." },
      { status: 409 }
    );
  }

  const supabase = createAdminServiceClient();

  // 이미 수집 중인 출처는 승인 대상이 아니다 — 서버에서도 막는다(화면 비활성화만 믿지 않는다).
  if (status === "approved") {
    const { data: dup } = await supabase
      .from("source_candidates")
      .select("id,url")
      .in("id", ids)
      .not("covered_by", "is", null)
      .limit(1);
    if (dup?.length) {
      return NextResponse.json(
        { error: `이미 수집 중인 출처가 포함돼 있습니다 (${dup[0].url}). 선택에서 빼고 다시 시도하세요.` },
        { status: 409 }
      );
    }
  }

  // status='new' 인 것만 바꾼다 — 이미 처리된 건을 덮어쓰지 않는다
  const { data, error } = await supabase
    .from("source_candidates")
    .update({ status })
    .in("id", ids)
    .eq("status", "new")
    .select("id,url,kind");
  if (error) {
    return NextResponse.json({ error: `처리 실패: ${error.message}` }, { status: 500 });
  }

  // 승격: 승인은 플래그만 바꾸는 게 아니라 실제로 수집이 시작되어야 한다.
  //  - blog    → trusted_sources 등록 (여기서 바로 처리)
  //  - threads → social_accounts.json 은 크롤러 쪽 파일이라 웹에서 못 쓴다.
  //              tools/promote_candidates.py 로 반영한다.
  //  - domain  → 게시판 목록 URL·상세 링크 정규식이 사이트마다 달라 자동화 불가.
  //              generic_board/official_pages 에 사람이 추가해야 한다.
  let promotedBlogs = 0;
  const manual = { threads: 0, domain: 0 };
  if (status === "approved" && data?.length) {
    const blogNames = data
      .filter((r) => r.kind === "blog")
      .map((r) => blogSourceName(r.url))
      .filter((n): n is string => Boolean(n));
    manual.threads = data.filter((r) => r.kind === "threads").length;
    manual.domain = data.filter((r) => r.kind === "domain").length;

    if (blogNames.length) {
      const { error: tErr } = await supabase
        .from("trusted_sources")
        .upsert(
          [...new Set(blogNames)].map((source_name) => ({ source_name })),
          { onConflict: "source_name", ignoreDuplicates: true }
        );
      if (tErr) {
        // 승인 자체는 이미 반영됐으므로 실패를 삼키지 않고 알린다
        return NextResponse.json(
          {
            success: true,
            changed: data.length,
            skipped: ids.length - data.length,
            warning: `승인은 됐지만 신뢰 출처 등록 실패: ${tErr.message}. tools/promote_candidates.py 로 재시도하세요.`,
          },
          { status: 200 }
        );
      }
      promotedBlogs = new Set(blogNames).size;
    }
  }

  return NextResponse.json({
    success: true,
    changed: data?.length ?? 0,
    skipped: ids.length - (data?.length ?? 0),
    promotedBlogs,
    manual,
  });
}
