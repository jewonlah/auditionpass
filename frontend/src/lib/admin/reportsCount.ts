import type { SupabaseClient } from "@supabase/supabase-js";

// auditions.reports_count = 반려(dismissed)되지 않은 신고 수.
// 신뢰 배지(36 §4)가 공고 행만으로 계산되도록 접수·처리 시점마다 재계산한다.
// 증감이 아니라 재계산이라 중복 호출·경합에도 값이 어긋나지 않는다.
export async function syncReportsCount(
  service: SupabaseClient,
  auditionId: string
): Promise<number | null> {
  const { count, error } = await service
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("audition_id", auditionId)
    .neq("status", "dismissed");
  if (error) return null;

  const value = count ?? 0;
  const { error: updateError } = await service
    .from("auditions")
    .update({ reports_count: value })
    .eq("id", auditionId);
  return updateError ? null : value;
}
