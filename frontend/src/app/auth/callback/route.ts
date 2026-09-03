import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveReturnTo, unwrapOnboardingReturnTo } from "@/lib/utils";

/**
 * 인증 콜백.
 *
 * 2026-08-29: 실패 케이스를 전부 삼키고 있었다. `if (code)` 하나뿐이라
 * 만료·재사용된 링크(`?error=access_denied`)나 신형 `token_hash` 템플릿이 오면
 * 아무 설명 없이 /login 으로 떨어졌다. 사용자 입장에서는 "메일 링크를 눌렀는데
 * 그냥 로그인 화면"이라 무엇이 잘못됐는지 알 수 없고 재가입 루프에 빠진다.
 * 이제 실패 사유를 /login 에 실어 보내 화면에서 안내할 수 있게 한다.
 *
 * 2026-09-03 (구글 OAuth 도입): **여기서 profiles 행을 만들지 않는다.**
 *  - auth.users → profiles 트리거는 존재하지 않는다(001~020 전체 확인). 이메일 가입도
 *    profiles 를 만들지 않고, 최초 프로필 저장(POST /api/profile — 지원 게이트 시트 ⓑ 또는
 *    /profile)에서 처음 생성된다. 구글 가입자도 정확히 같은 경로를 탄다.
 *  - 게다가 profiles.name·gender 는 NOT NULL(001)이라 (id, name) 만으로 upsert 하면
 *    23502 로 실패한다. 부분 행을 만들려면 스키마 변경이 선행돼야 한다.
 *  - 프로필 부재는 getMissingFields(@/lib/profile)가 이미 정상 상태로 다루므로
 *    구글 신규 가입자는 첫 지원 시 시트 ⓑ에서 미니 프로필을 채우게 된다.
 *
 * 2026-09-03 (온보딩 3스텝 도입, F4): 세션 수립 직후 profiles 행 유무를 확인해
 * 없으면 `/onboarding`으로 보낸다(returnTo는 그대로 릴레이 — 12_ia-userflows §6.2 #8).
 * 이메일 인증 링크·구글 OAuth 둘 다 이 콜백을 거치므로 신규 가입 경로가 하나로 통일된다.
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

  /**
   * 세션 수립 성공 후 착지 지점 결정 (F4).
   * profiles 행이 없는 사용자 = 온보딩을 아직 보지 못한 신규 가입자 → `/onboarding`.
   * 이미 프로필이 있으면(기존 유저 재인증 등) 원래 returnTo 그대로 통과.
   *
   * `returnTo`는 proxy→login 왕복을 거치며 이미 `/onboarding?returnTo=X` 형태로
   * 들어올 수 있다 — 여기서 그대로 다시 감싸면 `/onboarding?returnTo=/onboarding?...`
   * 로 깊어진다(Codex 교차 리뷰 결함, 2026-09-03). 감싸기 전에 먼저 벗겨 진짜
   * 목적지 하나만 남긴다.
   */
  async function landingAfterAuth(): Promise<NextResponse> {
    const finalReturnTo = unwrapOnboardingReturnTo(returnTo);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        const onboardingUrl = new URL("/onboarding", origin);
        onboardingUrl.searchParams.set("returnTo", finalReturnTo);
        return NextResponse.redirect(onboardingUrl);
      }
    }

    return NextResponse.redirect(`${origin}${finalReturnTo}`);
  }

  // PKCE 코드 교환 (기본 경로)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return landingAfterAuth();
    return fail(/expired|invalid/i.test(error.message) ? "expired_link" : "auth_failed");
  }

  // token_hash 템플릿 (Supabase 신형 이메일 템플릿). 메일 템플릿을 바꾸면 이 경로로 온다.
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash!,
    type: (type as "email" | "recovery" | "invite" | "magiclink") ?? "email",
  });
  if (!error) return landingAfterAuth();
  return fail(/expired|invalid/i.test(error.message) ? "expired_link" : "auth_failed");
}
