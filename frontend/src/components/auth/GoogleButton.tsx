"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveReturnTo } from "@/lib/utils";

/**
 * 구글 OAuth 공용 버튼 (11_prd F3·F4 · 12_ia-userflows §6 표 8행 / D8 — R1은 구글만).
 *
 * 로그인·회원가입 화면과 지원 게이트 시트 ⓐ 세 곳이 같은 버튼을 쓴다.
 * returnTo 는 `resolveReturnTo` 로 **같은 오리진의 경로만** 통과시킨다 —
 * 이 값이 그대로 리다이렉트 목적지가 되므로 검증을 건너뛰면 오픈 리다이렉트가 된다.
 *
 * 왕복 경로:
 *   버튼 → Google → {supabase-ref}.supabase.co/auth/v1/callback
 *        → (여기 redirectTo) /auth/callback?returnTo=…&code=… → exchangeCodeForSession → returnTo
 * `redirectTo` 는 Supabase Dashboard 의 Redirect URLs 에 등록돼 있어야 한다(미등록 시 Site URL 로 떨어짐).
 */
interface GoogleButtonProps {
  /** 로그인 후 돌아갈 내부 경로. 미검증 원문을 그대로 넘겨도 된다. */
  returnTo?: string | null;
  /** 폴백 경로 (기본 /home) */
  fallback?: string;
  label?: string;
}

export function GoogleButton({
  returnTo,
  fallback = "/home",
  label = "Google로 계속하기",
}: GoogleButtonProps) {
  const supabase = createClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setError("");
    setPending(true);

    const safeReturnTo = resolveReturnTo(returnTo, fallback);
    const redirectTo = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(
      safeReturnTo
    )}`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (oauthError) {
      // 여기서 실패하면 대개 provider 미설정. 사용자에게 원인은 감추고 대안(이메일)을 남긴다.
      setPending(false);
      setError("구글 로그인을 시작하지 못했습니다. 잠시 후 다시 시도하거나 이메일로 진행해주세요.");
      return;
    }
    // 성공 시 브라우저가 구글로 이동하므로 pending 을 되돌리지 않는다.
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleMark />
        {pending ? "구글로 이동 중..." : label}
      </button>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Google 브랜드 가이드의 "G" 마크. 브랜드 자산이라 색·형태를 바꾸지 않는다.
 * (23_design-system 의 이모지 금지 규칙과 무관 — 아이콘이 아니라 상표다)
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
      />
    </svg>
  );
}
