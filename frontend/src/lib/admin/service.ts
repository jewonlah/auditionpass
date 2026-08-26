// 어드민 전용 별칭 — 실제 구현은 lib/supabase/service.ts.
// 반드시 getAdminEmail()/getAdminGate() 통과 후에만 호출할 것 (RLS를 우회하므로).
export { createServiceRoleClient as createAdminServiceClient } from "@/lib/supabase/service";
