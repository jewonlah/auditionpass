import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { unwrapOnboardingReturnTo } from "@/lib/utils";

// Next.js 16: middleware 컨벤션이 proxy로 개명됨 (기능 동일)
const PROTECTED_ROUTES = ["/home", "/applications", "/profile", "/portfolio", "/my", "/admin", "/onboarding"];

export async function proxy(request: NextRequest) {
  // Deploy this gate on the old app BEFORE 034 removes its job upsert key.
  // API handlers retain their own authentication when the gate is open.
  const path = request.nextUrl.pathname;
  if (path === "/api/apply" || path.startsWith("/api/apply/")) {
    if (process.env.APPLICATION_SUBMISSIONS_PAUSED === "1") {
      return NextResponse.json(
        { code: "APPLICATION_PAUSED", error: "지원 기능을 점검 중이에요. 잠시 후 다시 시도해주세요." },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
      );
    }
    return NextResponse.next();
  }
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_ROUTES.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtected && !user) {
    // F3: 게이트 진입 시 원경로(+쿼리)를 returnTo로 부착 — 로그인 후 복귀
    const loginUrl = new URL("/login", request.url);
    const currentPath = request.nextUrl.pathname + request.nextUrl.search;
    // /onboarding 자체를 보호할 때는 이미 중첩된 returnTo(재방문·세션 만료 반복 등)를
    // 한 겹으로 정규화해 되돌려 보낸다 — 온보딩은 그대로 거치되 더 깊어지지 않는다.
    const target =
      request.nextUrl.pathname === "/onboarding"
        ? `/onboarding?returnTo=${encodeURIComponent(unwrapOnboardingReturnTo(currentPath))}`
        : currentPath;
    loginUrl.searchParams.set("returnTo", target);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/api/apply/:path*",
    "/home/:path*",
    "/applications/:path*",
    "/profile/:path*",
    "/portfolio/:path*",
    "/my/:path*",
    "/admin/:path*",
    "/admin",
    "/onboarding/:path*",
    "/onboarding",
  ],
};
