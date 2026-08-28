import { NextResponse } from "next/server";
import { getAdminEmail } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";

// 가입자 현황 (2026-08-28 신설). 그전까지 "누가 가입했는지" 볼 화면이 없어
// DB 를 직접 조회해야만 알 수 있었다.
//
// 유입 채널: auth 의 provider(email/google)는 "가입 수단"이지 "유입 경로"가 아니다.
// 실제 경로(검색·SNS·직접)는 가입 시점에 referrer/UTM 을 받아 적어야 알 수 있는데
// 아직 수집하지 않는다 → signup_source 가 전부 null 로 나온다. 021 에서 수집을 붙인다.

export async function GET() {
  const admin = await getAdminEmail();
  if (!admin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const supabase = createAdminServiceClient();

  const { data: list, error: authErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authErr) {
    return NextResponse.json({ error: `가입자 조회 실패: ${authErr.message}` }, { status: 500 });
  }
  const users = list?.users ?? [];
  const ids = users.map((u) => u.id);

  // 프로필 — 없을 수 있다(가입만 하고 이탈)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,name,gender,birth_year,genre,activity_field,photo_urls,phone,agency,created_at,updated_at")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  // 지원 이력
  const { data: apps } = await supabase
    .from("applications")
    .select("user_id,sent_at,status")
    .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const appCount = new Map<string, { total: number; last: string | null }>();
  for (const a of apps ?? []) {
    const cur = appCount.get(a.user_id) ?? { total: 0, last: null };
    cur.total += 1;
    if (a.sent_at && (!cur.last || a.sent_at > cur.last)) cur.last = a.sent_at;
    appCount.set(a.user_id, cur);
  }

  const items = users.map((u) => {
    const p = byId.get(u.id);
    const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
    const raw = (u.user_metadata ?? {}) as Record<string, unknown>;
    const a = appCount.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      confirmed: Boolean(u.email_confirmed_at),
      provider: (meta.provider as string) ?? null,
      // 가입 시 붙여둔 유입 정보(있다면). 없으면 null — 021 이후 가입분부터 채워진다.
      signup_source:
        (raw.signup_source as string) ?? (raw.utm_source as string) ?? (raw.referrer as string) ?? null,
      profile: p
        ? {
            name: p.name,
            gender: p.gender,
            birth_year: p.birth_year,
            genre: p.genre,
            activity_field: p.activity_field,
            photos: Array.isArray(p.photo_urls) ? p.photo_urls.length : 0,
            has_phone: Boolean(p.phone),
            agency: p.agency,
            updated_at: p.updated_at,
          }
        : null,
      applications: a?.total ?? 0,
      last_application: a?.last ?? null,
    };
  });

  items.sort((x, y) => (x.created_at < y.created_at ? 1 : -1));

  const now = Date.now();
  const since = (d: number) => new Date(now - d * 86400000).toISOString();
  const summary = {
    total: items.length,
    withProfile: items.filter((i) => i.profile).length,
    signup7d: items.filter((i) => i.created_at >= since(7)).length,
    signup30d: items.filter((i) => i.created_at >= since(30)).length,
    active7d: items.filter((i) => i.last_sign_in_at && i.last_sign_in_at >= since(7)).length,
    applications: items.reduce((s, i) => s + i.applications, 0),
    withSource: items.filter((i) => i.signup_source).length,
  };

  return NextResponse.json({ items, summary });
}
