import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { SuppressionManager } from "./SuppressionManager";
import { DemoteButton } from "./DemoteButton";
import { fetchSourceHealth, HEALTH_WINDOW_DAYS } from "@/lib/admin/sourceHealth";

export const dynamic = "force-dynamic";

// 소스 면 (39 §1 ④): 출처별 현황 + 30일 신고 집계·강등(36 §5) + suppression 긴급 차단.
// 승격(trust 부여)은 완전 별도 절차(39 §3)라 여기 없다. 티어 A~X 등급 표기는 R2.

type StatRow = {
  source_name: string | null;
  review_status: string;
  is_active: boolean;
};

// PostgREST는 응답 행 수에 상한(기본 1000)이 있어 .limit(20000)이 조용히 잘린다.
// 잘린 표본으로 집계하면 긴급 차단 판단의 근거 숫자가 틀리므로 range로 전량을 훑는다.
const PAGE = 1000;
const MAX_PAGES = 50;

async function fetchAllAuditionRows(
  supabase: ReturnType<typeof createAdminServiceClient>
): Promise<{ data: StatRow[]; error: { message: string } | null }> {
  const all: StatRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from("auditions")
      .select("source_name, review_status, is_active")
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { data: all, error };
    const rows = (data ?? []) as StatRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: all, error: null };
}

interface SourceStat {
  source: string;
  active: number;
  pending: number;
  quarantine: number;
  trusted: boolean;
  lastSaved: string | null;
}

export default async function AdminSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ block?: string }>;
}) {
  const gate = await getAdminGate();
  if (gate.status === "anon") redirect("/login?returnTo=/admin/sources");
  if (gate.status === "forbidden") notFound();

  const supabase = createAdminServiceClient();
  const { block } = await searchParams;

  const [rowsRes, trustedRes, logsRes, health] = await Promise.all([
    fetchAllAuditionRows(supabase),
    supabase.from("trusted_sources").select("source_name"),
    supabase
      .from("crawl_logs")
      .select("source_name, run_date, total_saved")
      .order("run_date", { ascending: false })
      .limit(500),
    fetchSourceHealth(supabase),
  ]);

  const trustedNames = ((trustedRes.data ?? []) as { source_name: string }[]).map(
    (t) => t.source_name
  );
  // trusted_sources는 '네이버카페:빛이 모이는 곳'처럼 하위 출처 단위로 저장된다.
  // 표는 접두("네이버카페")로 묶으므로, 그 접두의 하위 출처가 하나라도 신뢰면 신뢰로 본다.
  const isGroupTrusted = (head: string) =>
    trustedNames.some((n) => n === head || n.startsWith(`${head}:`));

  const lastSaved = new Map<string, string>();
  if (!logsRes.error) {
    for (const l of (logsRes.data ?? []) as {
      source_name: string;
      run_date: string;
      total_saved: number;
    }[]) {
      if (l.total_saved > 0 && !lastSaved.has(l.source_name)) {
        lastSaved.set(l.source_name, l.run_date);
      }
    }
  }

  const bySource = new Map<string, SourceStat>();
  for (const r of rowsRes.data) {
    const head = (r.source_name ?? "출처 미상").split(":")[0].trim();
    const stat =
      bySource.get(head) ??
      ({
        source: head,
        active: 0,
        pending: 0,
        quarantine: 0,
        trusted: isGroupTrusted(head),
        lastSaved: lastSaved.get(head) ?? null,
      } as SourceStat);
    if (r.is_active) stat.active += 1;
    if (r.review_status === "pending") stat.pending += 1;
    if (r.review_status === "quarantine") stat.quarantine += 1;
    bySource.set(head, stat);
  }
  // 강등 후보(신뢰 출처인데 30일 기준 초과)를 맨 위로 올린다
  const stats = [...bySource.values()].sort((a, b) => {
    const aDemote = a.trusted && health?.get(a.source)?.demote ? 1 : 0;
    const bDemote = b.trusted && health?.get(b.source)?.demote ? 1 : 0;
    if (aDemote !== bDemote) return bDemote - aDemote;
    return b.active - a.active;
  });
  const demoteCount = stats.filter(
    (s) => s.trusted && health?.get(s.source)?.demote
  ).length;

  return (
    <main className="flex flex-col gap-4 p-5 lg:p-7">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-[22px] font-extrabold tracking-tight">소스</h1>
        {health === null ? (
          <span className="text-[12.5px] text-[#8A8A86]">
            신고 집계 불가 — 015 마이그레이션 확인 필요
          </span>
        ) : demoteCount > 0 ? (
          <span className="rounded-full bg-[#FFFBEB] px-2.5 py-0.5 text-[11.5px] font-bold text-[#B45309]">
            강등 후보 {demoteCount}곳
          </span>
        ) : (
          <span className="text-[12.5px] text-[#8A8A86]">
            최근 {HEALTH_WINDOW_DAYS}일 강등 기준 초과 출처 없음
          </span>
        )}
      </div>

      <SuppressionManager initialBlockValue={block ?? ""} />

      <section className="overflow-x-auto rounded-[10px] border border-[#E7E5E0] bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#F0F0EE] text-left text-[11px] font-semibold tracking-wide text-[#8A8A86] uppercase">
              <th className="px-4 py-2.5">출처</th>
              <th className="px-3 py-2.5 text-right">활성</th>
              <th className="px-3 py-2.5 text-right">pending</th>
              <th className="px-3 py-2.5 text-right">격리</th>
              <th className="px-3 py-2.5">신뢰</th>
              <th className="px-3 py-2.5 text-right">신고 {HEALTH_WINDOW_DAYS}일</th>
              <th className="px-3 py-2.5">최근 저장</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.source} className="border-b border-[#F0F0EE] last:border-b-0">
                <td className="px-4 py-2 font-semibold">{s.source}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.active}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.pending}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[#DC2626]">
                  {s.quarantine || ""}
                </td>
                <td className="px-3 py-2">
                  {s.trusted ? (
                    <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10.5px] font-bold text-[#059669]">
                      trusted
                    </span>
                  ) : (
                    <span className="text-[#C9C7C1]">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {health === null ? (
                    <span className="text-[#C9C7C1]">—</span>
                  ) : (health.get(s.source)?.reports ?? 0) === 0 ? (
                    <span className="text-[#C9C7C1]">0</span>
                  ) : (
                    <span className="font-bold text-[#DC2626]">
                      {health.get(s.source)?.reports}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-[12px] text-[#8A8A86]">
                  {logsRes.error ? "crawl_logs 없음" : (s.lastSaved ?? "이력 없음")}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {s.trusted && health?.get(s.source)?.demote && (
                    <DemoteButton
                      source={s.source}
                      reasons={health.get(s.source)!.reasons}
                    />
                  )}
                  <a
                    href={`?block=${encodeURIComponent(s.source)}`}
                    className="ml-2 text-[12px] font-bold text-[#DC2626]"
                  >
                    긴급 차단
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[11.5px] text-[#8A8A86]">
        trust 승격·강등, 티어 A~X, 승인율 자동 산정은 별도 절차(39 §3) — 이 화면은 조회와 긴급 차단만.
      </p>
    </main>
  );
}
