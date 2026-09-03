import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";
import { createAdminServiceClient } from "@/lib/admin/service";
import { fetchSourceHealth } from "@/lib/admin/sourceHealth";
import { classifySources, fetchCrawlLogs } from "@/lib/admin/crawl-health";

export const dynamic = "force-dynamic";

// 오늘 홈 (39 §1 ①): "행동 필요한 것"만 4분면 — 마감 임박 pending / quarantine 신규 /
// 소스 상태(사망 의심 강조, 미개통은 접어서 노이즈 분리) / 3일+ 묵은 pending. 상태 지표는 하단 축소.

interface SlimRow {
  id: string;
  title: string;
  source_name: string | null;
  deadline: string | null;
  created_at: string;
}

function dday(deadline: string | null): string {
  if (!deadline) return "상시";
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const diff = Math.round(
    (new Date(deadline).getTime() - new Date(today).getTime()) / 86400000
  );
  return diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : `마감+${-diff}`;
}

function daysSince(kstDate: string, dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.round((new Date(kstDate).getTime() - new Date(dateStr).getTime()) / 86400000);
}

// 요청 시각 기준 조회 창. 컴포넌트 본문에서 직접 Date.now()를 부르면
// React Compiler purity 규칙에 걸리므로 모듈 스코프 함수로 분리한다 (force-dynamic 페이지).
function queryWindows() {
  const now = Date.now();
  const kstDate = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    now,
    kstDate,
    soon: new Date(new Date(kstDate).getTime() + 3 * 86400000).toISOString().slice(0, 10),
    threeDaysAgo: new Date(now - 3 * 86400000).toISOString(),
    oneDayAgo: new Date(now - 86400000).toISOString(),
    thirtyDaysAgo: new Date(now - 30 * 86400000).toISOString().slice(0, 10),
  };
}

export default async function AdminTodayPage() {
  const gate = await getAdminGate();
  if (gate.status === "anon") redirect("/login?returnTo=/admin");
  if (gate.status === "forbidden") notFound();

  const supabase = createAdminServiceClient();
  const { now, kstDate, soon, threeDaysAgo, oneDayAgo, thirtyDaysAgo } = queryWindows();

  const [
    urgent,
    quarantineRecent,
    quarantineCount,
    stalePending,
    pendingCount,
    activeCount,
    new24h,
    crawlLogs,
    actions24h,
    openReports,
  ] = await Promise.all([
    supabase
      .from("auditions")
      .select("id, title, source_name, deadline, created_at")
      .eq("review_status", "pending")
      .not("deadline", "is", null)
      .gte("deadline", kstDate)
      .lte("deadline", soon)
      .order("deadline", { ascending: true })
      .limit(7),
    supabase
      .from("auditions")
      .select("id, title, source_name, deadline, created_at")
      .eq("review_status", "quarantine")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("auditions")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "quarantine"),
    supabase
      .from("auditions")
      .select("id, title, source_name, deadline, created_at")
      .eq("review_status", "pending")
      .lt("created_at", threeDaysAgo)
      .limit(500),
    supabase
      .from("auditions")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "pending"),
    supabase
      .from("auditions")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("auditions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgo),
    fetchCrawlLogs(supabase, thirtyDaysAgo),
    supabase
      .from("admin_actions")
      .select("id", { count: "exact", head: true })
      .eq("action", "approve")
      .gte("created_at", oneDayAgo),
    supabase
      .from("reports")
      .select("id, severity, sla_due_at")
      .eq("status", "received")
      .order("sla_due_at", { ascending: true })
      .limit(50),
  ]);

  const urgentRows = (urgent.data ?? []) as SlimRow[];
  const quarantineRows = (quarantineRecent.data ?? []) as SlimRow[];

  // 3일+ pending을 출처별 집계
  const staleBySource = new Map<string, number>();
  for (const r of (stalePending.data ?? []) as SlimRow[]) {
    const key = (r.source_name ?? "출처 미상").split(":")[0].trim();
    staleBySource.set(key, (staleBySource.get(key) ?? 0) + 1);
  }
  const staleTop = [...staleBySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const staleTotal = (stalePending.data ?? []).length;

  // 신뢰 출처 중 30일 신고 기준을 넘긴 강등 후보 (36 §5)
  const { data: trustedRows } = await supabase.from("trusted_sources").select("source_name");
  const health = await fetchSourceHealth(supabase);
  const demoteCandidates = health
    ? [...new Set(
        ((trustedRows ?? []) as { source_name: string }[]).map((t) =>
          t.source_name.split(":")[0].trim()
        )
      )].filter((s) => health.get(s)?.demote)
    : [];

  // 신고 — 015 미적용이면 조회 실패로 강등 표시
  const reportsUnavailable = Boolean(openReports.error);
  const reports = (openReports.data ?? []) as {
    id: number;
    severity: string;
    sla_due_at: string;
  }[];
  const severeReports = reports.filter((r) => r.severity === "severe").length;
  const overdueReports = reports.filter((r) => new Date(r.sla_due_at).getTime() < now).length;

  // 소스 상태: 사망(30일 내 저장 이력 있었는데 최근 3일 0건) vs 미개통(30일 내내 0건) 분리 (crawl_log.py dead_sources()와 동일 규칙)
  const crawlLogsUnavailable = Boolean(crawlLogs.error);
  const sourceClassification = crawlLogsUnavailable
    ? null
    : classifySources(
        (crawlLogs.data ?? []) as { source_name: string; run_date: string; total_saved: number }[],
        new Date(now)
      );
  const deadSourcesAll = sourceClassification?.dead ?? [];
  const deadSources = deadSourcesAll.slice(0, 8);
  const deadSourcesHidden = deadSourcesAll.length - deadSources.length;
  const neverSources = sourceClassification?.never ?? [];

  const mono =
    "font-mono text-[10.5px] font-semibold tracking-[0.08em] text-[#8A8A86] uppercase";
  const card = "rounded-[10px] border border-[#E7E5E0] bg-white shadow-sm";
  const cardHead =
    "flex items-center gap-2 border-b border-[#F0F0EE] px-4 py-3 text-sm font-bold";
  const row =
    "flex items-baseline gap-3 border-b border-[#F0F0EE] px-4 py-2.5 text-[13.5px] last:border-b-0";
  const pill = (cls: string) =>
    `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`;

  return (
    <main className="flex flex-col gap-4 p-5 lg:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[22px] font-extrabold tracking-tight">
          오늘 — 행동이 필요한 것
        </h1>
        <span className={mono}>{kstDate}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 1. 마감 임박 pending */}
        <section className={card}>
          <div className={cardHead}>
            <span className={pill("bg-[#FEF2F2] text-[#DC2626]")}>{urgentRows.length}</span>
            마감 임박 pending — 오늘 승인 안 하면 죽는 공고
            <Link href="/admin/queue" className="ml-auto text-[12.5px] font-bold text-primary">
              큐에서 열기 →
            </Link>
          </div>
          {urgentRows.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-[#8A8A86]">3일 내 마감 pending 없음</p>
          )}
          {urgentRows.map((r) => (
            <div key={r.id} className={row}>
              <span className="w-12 shrink-0 font-bold text-[#EF4444] tabular-nums">
                {dday(r.deadline)}
              </span>
              <span className="min-w-0 truncate">{r.title}</span>
              <span className="ml-auto shrink-0 text-[12px] text-[#8A8A86]">
                {r.source_name?.split(":")[0]}
              </span>
            </div>
          ))}
        </section>

        {/* 2. quarantine 신규 */}
        <section className={card}>
          <div className={cardHead}>
            <span className={pill("bg-[#FEF2F2] text-[#DC2626]")}>
              {quarantineCount.count ?? 0}
            </span>
            격리(quarantine) — 확인 필요
          </div>
          {quarantineRows.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-[#8A8A86]">격리된 공고 없음</p>
          )}
          {quarantineRows.map((r) => (
            <div key={r.id} className={row}>
              <span className="min-w-0 truncate">{r.title}</span>
              <span className="ml-auto shrink-0 text-[12px] text-[#8A8A86]">
                {r.source_name?.split(":")[0]} · {r.created_at.slice(0, 10)}
              </span>
            </div>
          ))}
        </section>

        {/* 3. 소스 상태 */}
        <section className={card}>
          <div className={cardHead}>
            <span className={pill("bg-[#FEF2F2] text-[#DC2626]")}>{deadSourcesAll.length}</span>
            소스 상태 — 사망 의심
          </div>
          {demoteCandidates.length > 0 && (
            <div className={row}>
              <span className="font-bold text-[#B45309]">
                강등 후보 {demoteCandidates.length}곳 — {demoteCandidates.slice(0, 2).join(", ")}
                {demoteCandidates.length > 2 ? " 외" : ""}
              </span>
              <Link href="/admin/sources" className="ml-auto text-[12.5px] font-bold text-primary">
                소스 관리 →
              </Link>
            </div>
          )}
          {crawlLogsUnavailable ? (
            <p className="px-4 py-3 text-[13px] text-[#8A8A86]">
              crawl_logs 테이블 조회 불가 — 008/010 마이그레이션 라이브 적용 확인 필요
            </p>
          ) : deadSources.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-[#8A8A86]">사망 의심 소스 없음</p>
          ) : (
            <>
              {deadSources.map((s) => (
                <div key={s.source_name} className={row}>
                  <span className="font-bold text-[#DC2626]">{s.source_name}</span>
                  <span className="ml-auto text-[12.5px] text-[#8A8A86]">
                    {daysSince(kstDate, s.lastSaved)}일째 0건 · 마지막 저장 {s.lastSaved}
                  </span>
                </div>
              ))}
              {deadSourcesHidden > 0 && (
                <p className="px-4 py-2 text-[12px] text-[#8A8A86]">외 {deadSourcesHidden}건</p>
              )}
            </>
          )}
          {!crawlLogsUnavailable && neverSources.length > 0 && (
            <details className="border-t border-[#F0F0EE] px-4 py-2.5">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-[#8A8A86]">
                미개통 {neverSources.length}곳
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {neverSources.map((s) => (
                  <li key={s.source_name} className="text-[12.5px] text-[#8A8A86]">
                    {s.source_name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* 4. 신고 + 3일+ 묵은 pending */}
        <section className={card}>
          <div className={cardHead}>
            <span className={pill("bg-[#EEF2FF] text-[#3730A3]")}>{staleTotal}</span>
            3일+ 묵은 pending · 신고
            <Link href="/admin/queue" className="ml-auto text-[12.5px] font-bold text-primary">
              큐에서 열기 →
            </Link>
          </div>
          {reportsUnavailable ? (
            <div className={row}>
              <span className="text-[#8A8A86]">
                신고 조회 불가 — 015 마이그레이션 라이브 적용 필요
              </span>
            </div>
          ) : reports.length > 0 ? (
            <div className={row}>
              <span className="font-bold text-[#DC2626]">
                미처리 신고 {reports.length}건
                {severeReports > 0 ? ` (심각 ${severeReports})` : ""}
              </span>
              {overdueReports > 0 && (
                <span className={pill("bg-[#FEF2F2] text-[#DC2626]")}>SLA 초과 {overdueReports}</span>
              )}
              <Link href="/admin/reports" className="ml-auto text-[12.5px] font-bold text-primary">
                신고 처리 →
              </Link>
            </div>
          ) : (
            <div className={row}>
              <span className="text-[#8A8A86]">미처리 신고 없음</span>
            </div>
          )}
          {staleTop.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-[#8A8A86]">묵은 pending 없음</p>
          )}
          {staleTop.map(([source, count]) => (
            <div key={source} className={row}>
              <span>{source}</span>
              <span className="ml-auto tabular-nums text-[#8A8A86]">{count}건</span>
            </div>
          ))}
        </section>
      </div>

      {/* 하단 상태 지표 (축소) */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[10px] border border-[#E7E5E0] bg-white px-4 py-3 text-[12.5px] text-[#4A4A48]">
        <span className={mono}>상태</span>
        <span>
          활성 <b className="tabular-nums">{activeCount.count ?? 0}</b>
        </span>
        <span>
          24h 신규 <b className="tabular-nums">{new24h.count ?? 0}</b>
        </span>
        <span>
          24h 승인 <b className="tabular-nums">{actions24h.count ?? 0}</b>
        </span>
        <span>
          검수 백로그 <b className="tabular-nums">{pendingCount.count ?? 0}</b>
        </span>
        <span>
          격리 <b className="tabular-nums">{quarantineCount.count ?? 0}</b>
        </span>
        {!reportsUnavailable && (
          <span>
            미처리 신고 <b className="tabular-nums">{reports.length}</b>
          </span>
        )}
      </div>
    </main>
  );
}
