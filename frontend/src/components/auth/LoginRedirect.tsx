"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { withReturnTo } from "@/lib/utils";

/**
 * 비로그인 사용자를 로그인 화면으로 보내되, 돌아올 곳(returnTo)을 유지한다.
 *
 * 렌더 함수 본문에서 `router.push()` 를 부르면 React 부작용 규칙 위반이라
 * 개발 모드 경고와 이중 내비게이션이 생긴다. 이동은 effect 에서 한다.
 */
export function LoginRedirect({ returnTo }: { returnTo: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(withReturnTo("/login", returnTo));
  }, [router, returnTo]);

  return null;
}
