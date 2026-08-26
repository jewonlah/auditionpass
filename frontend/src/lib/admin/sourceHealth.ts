import type { SupabaseClient } from "@supabase/supabase-js";

// 소스 강등 기준 (플랜 36 §5 "소스 중단 기준").
// 30일 내 유효 신고 3건 · 삭제 요청 2건 · 사기 2건 중 하나라도 넘으면 강등 대상.
// 강등 = trusted_sources에서 제거 → 이후 신규 공고는 자동 게재 대신 pending으로 들어간다.
//
// 반송률 20% 기준은 발송 코어(M2)가 반송 데이터를 만들기 전까지 판정할 수 없어 제외한다.

export const HEALTH_WINDOW_DAYS = 30;
const THRESHOLD_REPORTS = 3;
const THRESHOLD_TAKEDOWN = 2;
const THRESHOLD_SCAM = 2;

export interface SourceHealth {
  reports: number; // 유효 신고(반려 제외)
  takedown: number; // 삭제 요청
  scam: number; // 사기 의심
  demote: boolean;
  reasons: string[];
}

export type HealthMap = Map<string, SourceHealth>;

function evaluate(h: Omit<SourceHealth, "demote" | "reasons">): SourceHealth {
  const reasons: string[] = [];
  if (h.reports >= THRESHOLD_REPORTS) reasons.push(`유효 신고 ${h.reports}건`);
  if (h.takedown >= THRESHOLD_TAKEDOWN) reasons.push(`삭제 요청 ${h.takedown}건`);
  if (h.scam >= THRESHOLD_SCAM) reasons.push(`사기 신고 ${h.scam}건`);
  return { ...h, demote: reasons.length > 0, reasons };
}

/**
 * 출처별 30일 신고 집계. 출처명은 접두 기준("네이버카페: xx" → "네이버카페")으로 묶는다.
 * reports 테이블이 없으면(015 미적용) null을 돌려 호출부가 판정을 생략하게 한다.
 */
export async function fetchSourceHealth(
  supabase: SupabaseClient,
  windowDays = HEALTH_WINDOW_DAYS
): Promise<HealthMap | null> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { data, error } = await supabase
    .from("reports")
    .select("reason, status, auditions!inner(source_name)")
    .neq("status", "dismissed")
    .gte("created_at", since);
  if (error) return null;

  // 조인 결과는 클라이언트 버전에 따라 객체 또는 1건 배열로 온다 — 양쪽 모두 처리
  type Joined = { source_name: string | null } | { source_name: string | null }[] | null;
  const sourceOf = (j: Joined): string | null =>
    Array.isArray(j) ? (j[0]?.source_name ?? null) : (j?.source_name ?? null);

  const acc = new Map<string, { reports: number; takedown: number; scam: number }>();
  for (const row of (data ?? []) as unknown as { reason: string; auditions: Joined }[]) {
    const head = (sourceOf(row.auditions) ?? "출처 미상").split(":")[0].trim();
    const cur = acc.get(head) ?? { reports: 0, takedown: 0, scam: 0 };
    cur.reports += 1;
    if (row.reason === "takedown") cur.takedown += 1;
    if (row.reason === "scam") cur.scam += 1;
    acc.set(head, cur);
  }

  const out: HealthMap = new Map();
  for (const [source, counts] of acc) out.set(source, evaluate(counts));
  return out;
}
