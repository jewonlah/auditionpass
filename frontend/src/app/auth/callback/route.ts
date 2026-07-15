import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveReturnTo } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // F3: OAuth/이메일 인증 왕복에도 returnTo 유지 (내부 경로만, 폴백 /home)
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = resolveReturnTo(rawReturnTo, "/home");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server Component 호출 시 무시
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${returnTo}`);
    }
  }

  // 인증 실패 시 로그인 페이지로 (returnTo 유지)
  const loginUrl = new URL("/login", origin);
  if (rawReturnTo) loginUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(loginUrl);
}
