import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { SuppressionManager } from "./SuppressionManager";

export const dynamic = "force-dynamic";

// 소스 면 (39 §1 ④, R1b 최소판): 출처별 현황 조회 + suppression 긴급 차단.
// trust 승격/강등은 완전 별도 절차(§3)라 이 화면에 두지 않는다. 티어 A~X는 R2.

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

  const [rowsRes, trustedRes, logsRes] = await Promise.all([
    supabase
      .from("auditions")
      .select("source_name, review_status, is_active")
      .limit(20000),
    supabase.from("trusted_sources").select("source_name"),
    supabase
      .from("crawl_logs")
      .select("source_name, run_date, total_saved")
      .order("run_date", { ascending: false })
      .limit(500),
  ]);

  const trusted = new Set(
    ((trustedRes.data ?? []) as { source_name: string }[]).map((t) => t.source_name)
  );

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
  for (const r of (rowsRes.data ?? []) as {
    source_name: string | null;
    review_status: string;
    is_active: boolean;
  }[]) {
    const head = (r.source_name ?? "출처 미상").split(":")[0].trim();
    const stat =
      bySource.get(head) ??
      ({
        source: head,
        active: 0,
        pending: 0,
        quarantine: 0,
        trusted: trusted.has(head),
        lastSaved: lastSaved.get(head) ?? null,
      } as SourceStat);
    if (r.is_active) stat.active += 1;
    if (r.review_status === "pending") stat.pending += 1;
    if (r.review_status === "quarantine") stat.quarantine += 1;
    bySource.set(head, stat);
  }
  const stats = [...bySource.values()].sort((a, b) => b.active - a.active);

  return (
    <main className="flex flex-col gap-4 p-5 lg:p-7">
      <h1 className="text-[22px] font-extrabold tracking-tight">소스</h1>

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
                <td className="px-3 py-2 text-[12px] text-[#8A8A86]">
                  {logsRes.error ? "crawl_logs 없음" : (s.lastSaved ?? "이력 없음")}
                </td>
                <td className="px-3 py-2 text-right">
                  <a href={`?block=${encodeURIComponent(s.source)}`} className="text-[12px] font-bold text-[#DC2626]">
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
