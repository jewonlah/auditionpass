import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 어드민 전용 service role 클라이언트 — anon 폴백 없음.
// 반드시 getAdminEmail() 통과 후에만 호출할 것 (RLS를 우회하므로).
export function createAdminServiceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
