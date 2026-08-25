import { riskScore, type RiskResult } from "./risk";

// 승인 게이트 3단 (39_admin.md §2) — 서버에서 판정하고, 액션 API에서도 재판정해 강제한다.
// SAFE: 1키 즉시 게시 승인 / CHECK: 차단 사유 확인 후 승인 / BLOCKED: 승인 불가.

export type GateDecision = "SAFE" | "CHECK" | "BLOCKED";

export interface AdminAuditionRow {
  id: string;
  title: string;
  company: string | null;
  genre: string | null;
  category: string | null;
  deadline: string | null;
  apply_email: string | null;
  description: string | null;
  requirements: string | null;
  source_url: string | null;
  source_name: string | null;
  quality_score: number | null;
  review_status: string;
  is_active: boolean;
  created_at: string;
}

export interface DedupHit {
  id: string;
  title: string;
  review_status: string;
  deadline: string | null;
}

export interface GateResult {
  decision: GateDecision;
  blockedReasons: string[]; // BLOCKED 사유 (승인 비활성 근거)
  checkReasons: string[]; // CHECK 사유 (확인 후 승인 가능)
  risk: RiskResult;
  trusted: boolean;
  dedup: DedupHit[];
}

function isPastDeadline(deadline: string | null): boolean {
  if (!deadline) return false;
  const today = new Date();
  const kstToday = new Date(today.getTime() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return deadline < kstToday;
}

export function evaluateGate(
  row: AdminAuditionRow,
  opts: { trusted: boolean; dedup: DedupHit[] }
): GateResult {
  const risk = riskScore(row.title, row.description);
  const blocked: string[] = [];
  const check: string[] = [];

  // --- BLOCKED 조건 (39 §2) ---
  if (row.review_status === "quarantine") blocked.push("격리 상태 — 큐에서 승인 불가");
  if (risk.score >= 7) blocked.push(`위험 점수 ${risk.score} (격리 기준 7+)`);
  if (risk.reasons.includes("비용 징수 문맥")) blocked.push("금전 요구");
  if (risk.minor && (risk.reasons.includes("성인·노출") || risk.reasons.includes("신분증·금융정보 요구")))
    blocked.push("미성년 대상 + 민감 요소");
  if (!row.source_url) blocked.push("공개 출처 없음 (원문 URL 부재)");
  if (!row.deadline) blocked.push("마감 missing");
  else if (isPastDeadline(row.deadline)) blocked.push("마감 과거 (이미 지남)");
  if (!row.apply_email) blocked.push("지원처 불명 (이메일 없음)");
  // dedup 확정 충돌: 이미 게재(approved/auto)된 공고와 같은 이메일 + 같은 마감
  const hardDup = opts.dedup.filter(
    (d) =>
      ["approved", "auto"].includes(d.review_status) &&
      d.deadline != null &&
      d.deadline === row.deadline
  );
  if (hardDup.length > 0) blocked.push(`dedup 충돌 — 게재 중 동일 공고 의심 ${hardDup.length}건`);

  if (blocked.length > 0) {
    return { decision: "BLOCKED", blockedReasons: blocked, checkReasons: check, risk, trusted: opts.trusted, dedup: opts.dedup };
  }

  // --- CHECK 조건 (Guarded) ---
  if (!opts.trusted) check.push("신규·미신뢰 출처");
  if (risk.score > 0) check.push(`위험 신호 ${risk.score}점: ${risk.reasons.join(", ")}`);
  if (opts.dedup.length > 0) check.push(`중복 후보 ${opts.dedup.length}건 — 병합 검토`);
  if ((row.quality_score ?? 0) < 0.5) check.push(`품질 점수 낮음 (${row.quality_score ?? 0})`);
  const payAmbiguous = !/(페이|출연료|회차비|보수|급여|무페이|무급)/.test(
    `${row.title || ""}${row.description || ""}`
  );
  if (payAmbiguous) check.push("페이 불명확 — 원문 확인 권장");

  if (check.length > 0) {
    return { decision: "CHECK", blockedReasons: [], checkReasons: check, risk, trusted: opts.trusted, dedup: opts.dedup };
  }

  return { decision: "SAFE", blockedReasons: [], checkReasons: [], risk, trusted: opts.trusted, dedup: opts.dedup };
}
