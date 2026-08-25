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

const QUEUE_COLUMNS =
  "id, title, company, genre, category, deadline, apply_email, description, requirements, source_url, source_name, quality_score, review_status, is_active, created_at";

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

// 014 미적용이면 빈 목록 (게이트에서 suppression 판정 생략)
async function fetchSuppressionRules(supabase: SupabaseClient): Promise<SuppressionRule[]> {
  const { data } = await supabase.from("suppression").select("kind, value");
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
    const { data: dupRows } = await supabase
      .from("auditions")
      .select("id, title, review_status, deadline, apply_email")
      .in("apply_email", emails);
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
