import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { resolveReturnTo, unwrapOnboardingReturnTo } from "@/lib/utils";
import { OnboardingClient } from "@/components/onboarding/OnboardingClient";

export const metadata: Metadata = {
  title: "시작하기",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * 온보딩 3스텝 진입점 (11_prd F4 · 12_ia-userflows §1.1).
 *
 * `src/proxy.ts`가 1차로 비로그인을 `/login`으로 보내지만, 서버에서도 방어한다
 * (다른 🔒 페이지와 동일 관례 — home/page.tsx 참조).
 * 이미 프로필 행이 있는 사용자는 재진입할 이유가 없으므로 returnTo로 바로 보낸다
 * (returnTo 없으면 폴백 /home — 하드코딩 /home 고정 아님, Codex 교차 리뷰 결함 수정).
 *
 * returnTo는 proxy→login→callback 왕복을 거치며 `/onboarding?returnTo=X` 형태로
 * 들어올 수 있어 `unwrapOnboardingReturnTo`로 먼저 벗겨낸다 — 그래야 이 페이지가
 * 만드는 로그인 리다이렉트·최종 이동 모두 중첩을 새로 만들지 않는다.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = unwrapOnboardingReturnTo(resolveReturnTo(params.returnTo, "/home"));

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const self = `/onboarding?returnTo=${encodeURIComponent(returnTo)}`;
    redirect(`/login?returnTo=${encodeURIComponent(self)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) redirect(returnTo);

  return <OnboardingClient returnTo={returnTo} />;
}
