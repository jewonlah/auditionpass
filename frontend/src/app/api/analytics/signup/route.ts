import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  // A claim changes deduplication state; reject cross-origin browser requests.
  // Next/Vercel can expose an internal host in request.url; use the configured site origin.
  const siteOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.auditionpass.co.kr").origin;
  if (request.headers.get("origin") !== siteOrigin) {
    return NextResponse.json({ error: "요청 출처를 확인해주세요.", code: "INVALID_ORIGIN" }, { status: 403, headers });
  }
  const db = await createServerClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ event: null }, { status: 401, headers });
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (user.email && admins.includes(user.email.toLowerCase())) {
    return NextResponse.json({ event: null }, { headers });
  }
  const { data, error } = await db.rpc("claim_signup_analytics");
  // An unapplied migration or unavailable database never blocks authentication.
  if (error) return NextResponse.json({ error: "측정을 잠시 사용할 수 없습니다.", code: "ANALYTICS_UNAVAILABLE" }, { status: 503, headers });
  const method: unknown = data?.[0]?.method;
  return NextResponse.json({ event: method === "email" || method === "google" ? { name: "sign_up", method } : null }, { headers });
}
