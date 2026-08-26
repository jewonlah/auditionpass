import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// RLS를 우회하는 service role 클라이언트 — anon 폴백 없음.
// 호출자가 권한을 먼저 검증한 뒤에만 사용할 것 (어드민 게이트, 또는 세션 검증을 마친 서버 로직).
export function createServiceRoleClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
