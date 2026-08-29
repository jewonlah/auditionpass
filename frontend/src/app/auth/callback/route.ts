import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveReturnTo } from "@/lib/utils";

/**
 * 인증 콜백.
 *
 * 2026-08-29: 실패 케이스를 전부 삼키고 있었다. `if (code)` 하나뿐이라
 * 만료·재사용된 링크(`?error=access_denied`)나 신형 `token_hash` 템플릿이 오면
 * 아무 설명 없이 /login 으로 떨어졌다. 사용자 입장에서는 "메일 링크를 눌렀는데
 * 그냥 로그인 화면"이라 무엇이 잘못됐는지 알 수 없고 재가입 루프에 빠진다.
 * 이제 실패 사유를 /login 에 실어 보내 화면에서 안내할 수 있게 한다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const authError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  // F3: OAuth/이메일 인증 왕복에도 returnTo 유지 (내부 경로만, 폴백 /home)
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = resolveReturnTo(rawReturnTo, "/home");

  /** 실패 시 로그인 화면으로. reason 을 실어 안내 문구를 띄울 수 있게 한다. */
  function fail(reason: string) {
    const loginUrl = new URL("/login", origin);
    if (rawReturnTo) loginUrl.searchParams.set("returnTo", returnTo);
    loginUrl.searchParams.set("error", reason);
    return NextResponse.redirect(loginUrl);
  }

  // Supabase 가 에러를 쿼리로 돌려준 경우 (만료·이미 사용된 링크가 대부분)
  if (authError) {
    const expired =
      errorCode === "otp_expired" ||
      /expired|invalid/i.test(errorDescription ?? "") ||
      authError === "access_denied";
    return fail(expired ? "expired_link" : "auth_failed");
  }

  if (!code && !tokenHash) {
    return fail("missing_code");
  }

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

  // PKCE 코드 교환 (기본 경로)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${returnTo}`);
    return fail(/expired|invalid/i.test(error.message) ? "expired_link" : "auth_failed");
  }

  // token_hash 템플릿 (Supabase 신형 이메일 템플릿). 메일 템플릿을 바꾸면 이 경로로 온다.
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash!,
    type: (type as "email" | "recovery" | "invite" | "magiclink") ?? "email",
  });
  if (!error) return NextResponse.redirect(`${origin}${returnTo}`);
  return fail(/expired|invalid/i.test(error.message) ? "expired_link" : "auth_failed");
}
