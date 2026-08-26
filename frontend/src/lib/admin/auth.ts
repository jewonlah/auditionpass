import { createServerClient } from "@/lib/supabase/server";

// R1 어드민 게이트: ADMIN_EMAILS 환경변수 화이트리스트 (쉼표 구분).
// 1인 운영 전제 — DB 롤/RLS 기반 게이트는 M2에서 승격 (39_admin.md §5).
// service role 키는 이 검증을 통과한 서버 코드에서만 사용한다.
export type AdminGateResult =
  | { status: "ok"; email: string }
  | { status: "anon" } // 미로그인 → 로그인으로
  | { status: "forbidden" }; // 로그인했지만 화이트리스트 아님 → 404 (어드민 존재 은닉)

export async function getAdminGate(): Promise<AdminGateResult> {
  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anon" };
  const email = user.email?.toLowerCase();
  if (!email || allowlist.length === 0 || !allowlist.includes(email)) {
    return { status: "forbidden" };
  }
  // 이메일 미인증 계정은 어드민으로 인정하지 않는다 —
  // 화이트리스트 주소가 아직 미가입이면 누구나 그 주소로 가입해 선점할 수 있다.
  if (!user.email_confirmed_at) return { status: "forbidden" };
  return { status: "ok", email };
}

export async function getAdminEmail(): Promise<string | null> {
  const gate = await getAdminGate();
  return gate.status === "ok" ? gate.email : null;
}
