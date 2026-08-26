import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateGate,
  type AdminAuditionRow,
  type DedupHit,
  type GateResult,
} from "./gate";

export interface QueueItem extends AdminAuditionRow {
  gate: GateResult;
}

// 015가 아직 적용되지 않은 라이브에서는 oneclick_blocked·reports_count 컬럼이 없다.
// 명시 목록으로 select하면 컬럼 부재가 쿼리 전체를 깨뜨리므로 "*"로 받고, 없으면 undefined로 판정에서 생략된다.
const QUEUE_COLUMNS = "*";

// trusted_sources 매칭: 정확 일치 또는 접두("네이버카페: xx" → "네이버카페") 일치
function isTrusted(sourceName: string | null, trusted: Set<string>): boolean {
  if (!sourceName) return false;
  if (trusted.has(sourceName)) return true;
  const head = sourceName.split(":")[0].trim();
  return trusted.has(head);
}

type SuppressionRule = { kind: string; value: string };

// 크롤러(crawler/utils/supabase_client.py suppression_hit)와 동일 규칙 — 한쪽 수정 시 같이 갱신
function suppressionHit(row: AdminAuditionRow, rules: SuppressionRule[]): string | null {
  const email = (row.apply_email ?? "").toLowerCase();
  const url = (row.source_url ?? "").toLowerCase();
  const name = row.source_name ?? "";
  const head = name.split(":")[0].trim();
  for (const r of rules) {
    if (r.kind === "email" && email === r.value) return `email:${r.value}`;
    if (r.kind === "domain" && (email.endsWith(`@${r.value}`) || url.includes(r.value)))
      return `domain:${r.value}`;
    if (r.kind === "source" && (name === r.value || head === r.value)) return `source:${r.value}`;
  }
  return null;
}

// 테이블 자체가 없는 경우(마이그레이션 미적용)만 정상 강등으로 간주한다.
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|schema cache/i.test(error.message ?? "")
  );
}

// 014 미적용이면 빈 목록(판정 생략). 그 외 조회 실패는 삼키지 않는다 —
// 조용히 빈 목록을 쓰면 차단해 둔 공고의 BLOCKED가 사라져 승인 가능해진다(fail-open).
async function fetchSuppressionRules(supabase: SupabaseClient): Promise<SuppressionRule[]> {
  const { data, error } = await supabase.from("suppression").select("kind, value");
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`suppression 조회 실패 — 안전을 위해 검수를 중단합니다: ${error.message}`);
  }
  return (data ?? []) as SuppressionRule[];
}

export async function fetchQueueItems(
  supabase: SupabaseClient,
  limit = 200
): Promise<QueueItem[]> {
  const [{ data: rows, error }, { data: trustedRows }, suppressionRules] = await Promise.all([
    supabase
      .from("auditions")
      .select(QUEUE_COLUMNS)
      .eq("review_status", "pending")
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("trusted_sources").select("source_name"),
    fetchSuppressionRules(supabase),
  ]);
  if (error) throw new Error(`검수 큐 조회 실패: ${error.message}`);

  const pending = (rows ?? []) as AdminAuditionRow[];
  const trusted = new Set(
    ((trustedRows ?? []) as { source_name: string }[]).map((t) => t.source_name)
  );

  // dedup-lite: 같은 apply_email을 가진 다른 공고 (게재 중이면 게이트에서 충돌 판정)
  const emails = [...new Set(pending.map((r) => r.apply_email).filter(Boolean))] as string[];
  const dedupByEmail = new Map<string, DedupHit[]>();
  if (emails.length > 0) {
    const { data: dupRows, error: dupError } = await supabase
      .from("auditions")
      .select("id, title, review_status, deadline, apply_email")
      .in("apply_email", emails);
    // dedup 조회가 조용히 실패하면 충돌 BLOCKED와 중복 CHECK가 통째로 사라진다
    if (dupError) throw new Error(`dedup 조회 실패 — 검수를 중단합니다: ${dupError.message}`);
    for (const d of (dupRows ?? []) as (DedupHit & { apply_email: string })[]) {
      const list = dedupByEmail.get(d.apply_email) ?? [];
      list.push(d);
      dedupByEmail.set(d.apply_email, list);
    }
  }

  return pending.map((row) => {
    const dedup = (row.apply_email ? dedupByEmail.get(row.apply_email) ?? [] : []).filter(
      (d) => d.id !== row.id
    );
    return {
      ...row,
      gate: evaluateGate(row, {
        trusted: isTrusted(row.source_name, trusted),
        dedup,
        suppressionHit: suppressionHit(row, suppressionRules),
      }),
    };
  });
}

// 단건 재판정 — 액션 API에서 서버측 게이트 강제용
export async function evaluateSingle(
  supabase: SupabaseClient,
  auditionId: string
): Promise<{ row: AdminAuditionRow; gate: GateResult } | null> {
  const { data: row } = await supabase
    .from("auditions")
    .select(QUEUE_COLUMNS)
    .eq("id", auditionId)
    .maybeSingle();
  if (!row) return null;

  const typed = row as AdminAuditionRow;
  const [{ data: trustedRows }, suppressionRules] = await Promise.all([
    supabase.from("trusted_sources").select("source_name"),
    fetchSuppressionRules(supabase),
  ]);
  const trusted = new Set(
    ((trustedRows ?? []) as { source_name: string }[]).map((t) => t.source_name)
  );

  let dedup: DedupHit[] = [];
  if (typed.apply_email) {
    const { data: dupRows } = await supabase
      .from("auditions")
      .select("id, title, review_status, deadline")
      .eq("apply_email", typed.apply_email)
      .neq("id", typed.id);
    dedup = (dupRows ?? []) as DedupHit[];
  }

  return {
    row: typed,
    gate: evaluateGate(typed, {
      trusted: isTrusted(typed.source_name, trusted),
      dedup,
      suppressionHit: suppressionHit(typed, suppressionRules),
    }),
  };
}
