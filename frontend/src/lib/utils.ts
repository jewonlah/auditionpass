/**
 * 오늘 날짜 (KST 기준, YYYY-MM-DD)
 * ⚠️ `new Date().toISOString()`은 UTC라서 KST 자정~09시 사이에 어제 날짜가 됨 —
 * 마감 필터가 마감 지난 공고를 통과시키는 원인 (F10). 서버·클라이언트 공용.
 */
export function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

/**
 * D-Day 계산 (마감일까지 남은 일수)
 */
export function getDday(deadline: string | null): number | null {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * D-Day 텍스트 포맷
 */
export function formatDday(deadline: string | null): string {
  const dday = getDday(deadline);
  if (dday === null) return "마감일 미정";
  if (dday < 0) return "마감";
  if (dday === 0) return "D-Day";
  return `D-${dday}`;
}

/**
 * 날짜 포맷 (YYYY.MM.DD)
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * cn: className 합치기 유틸
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * returnTo 검증·소비 (F3)
 * 동일 오리진 상대 경로만 허용 — `/`로 시작, `//`·`/\`·절대 URL 거부 (오픈 리다이렉트 방어).
 * 검증 실패/부재 시 fallback 반환.
 */
export function resolveReturnTo(
  raw: string | null | undefined,
  fallback: string
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

/**
 * 현재 경로(+쿼리)를 returnTo 쿼리로 부착한 로그인 경로 생성
 */
export function withReturnTo(basePath: string, returnTo: string): string {
  return `${basePath}?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * `/onboarding`으로 향하는 returnTo가 스스로를 감싸는 중첩을 재귀적으로 풀어낸다.
 *
 * proxy → login → auth/callback → onboarding 리다이렉트 체인이 서로의 returnTo를
 * 감싸면서 `/onboarding?returnTo=/onboarding?returnTo=...`처럼 깊어질 수 있다
 * (Codex 교차 리뷰 결함, 2026-09-03) — 최종 목적지 하나만 남을 때까지 벗겨낸다.
 * 벗겨낸 끝이 `/onboarding` 자체(잔여 returnTo 없음)면 `/home`으로 떨어진다.
 * `/onboarding`이 아닌 값은 그대로 반환한다(정상 케이스는 no-op).
 */
export function unwrapOnboardingReturnTo(returnTo: string): string {
  let current = returnTo;

  // 정상 케이스는 1~2단이면 충분 — 상한은 순수 방어용
  for (let i = 0; i < 10; i++) {
    let url: URL;
    try {
      url = new URL(current, "http://internal");
    } catch {
      return current;
    }
    if (url.pathname !== "/onboarding") return current;

    const nested = url.searchParams.get("returnTo");
    if (!nested) return "/home";
    current = nested;
  }

  return "/home";
}
