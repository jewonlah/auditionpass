import type { SupabaseClient } from "@supabase/supabase-js";

// crawl_logs 기반 소스 생존 판정. crawler/utils/crawl_log.py의 dead_sources()와
// 규칙을 이중 유지한다 — 한쪽만 바뀌면 어드민 경보와 크롤러 로그가 어긋난다.
//
// - 사망(dead): 최근 historyDays 안에 저장 이력이 있었는데 최근 days일은 0건.
//   (필메코·캐스트링크가 4개월 죽은 걸 모르고 지나간 사례가 이것 — 실제 경보 대상)
// - 미개통(never): historyDays 내내 한 번도 저장이 없던 소스(신규·미구현·비수기).
//   경보에 섞이면 진짜 사망 신호가 묻힌다.
// - historyDays 밖(퇴역 소스)은 결과에서 제외한다 — 계속 경보에 뜨지 않게.
// - RETIRED_SOURCES(예: V오디션)는 historyDays 안이어도 결과에서 제외한다 — main.py에
//   더는 없는 소스가 과거 crawl_logs 잔재 때문에 계속 "사망"으로 뜨는 걸 막는다.
//   crawler/utils/crawl_log.py의 RETIRED_SOURCES와 동기 유지할 것.

export const RETIRED_SOURCES: ReadonlySet<string> = new Set(["V오디션"]);

export interface CrawlLogRow {
  source_name: string;
  run_date: string; // YYYY-MM-DD
  total_saved: number;
}

export interface CrawlSourceStatus {
  source_name: string;
  lastSaved: string | null;
  savedLast3d: number;
  savedLast30d: number;
}

const DEFAULT_DAYS = 3;
const DEFAULT_HISTORY_DAYS = 30;

// PostgREST는 응답 행 수에 상한(기본 1000)이 있어 단발 .limit(2000) 같은 요청이
// 조용히 1000행에서 잘린다. run_date desc 정렬이라 오래된 쪽(21~30일 전)이 잘려나가
// 그 구간에 마지막 저장이 있던 소스가 "미개통"으로 오분류된다(2026-09 실측).
// range로 전량을 훑고, 폭주 방지용 안전 상한만 둔다.
const FETCH_PAGE = 1000;
const FETCH_MAX_ROWS = 20000;

/**
 * sinceDate(YYYY-MM-DD) 이후 crawl_logs 전량을 range 페이지네이션으로 훑는다.
 * fetchAllAuditionRows(admin/sources/page.tsx)와 동일한 패턴.
 */
export async function fetchCrawlLogs(
  supabase: SupabaseClient,
  sinceDate: string
): Promise<{ data: CrawlLogRow[]; error: { message: string } | null }> {
  const all: CrawlLogRow[] = [];
  for (let offset = 0; offset < FETCH_MAX_ROWS; offset += FETCH_PAGE) {
    const { data, error } = await supabase
      .from("crawl_logs")
      .select("source_name, run_date, total_saved")
      .gte("run_date", sinceDate)
      .order("run_date", { ascending: false })
      .order("source_name", { ascending: true })
      .range(offset, offset + FETCH_PAGE - 1);
    if (error) return { data: all, error };
    const rows = (data ?? []) as CrawlLogRow[];
    all.push(...rows);
    if (rows.length < FETCH_PAGE) break;
  }
  return { data: all, error: null };
}

function isoDateDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
}

export function classifySources(
  logs: CrawlLogRow[],
  now: Date,
  opts: { days?: number; historyDays?: number } = {}
): { dead: CrawlSourceStatus[]; never: CrawlSourceStatus[]; healthy: CrawlSourceStatus[] } {
  const days = opts.days ?? DEFAULT_DAYS;
  const historyDays = opts.historyDays ?? DEFAULT_HISTORY_DAYS;
  const since = isoDateDaysAgo(now, days);
  const sinceHist = isoDateDaysAgo(now, historyDays);

  const recent = new Map<string, number>();
  const older = new Map<string, number>();
  const lastSaved = new Map<string, string>();

  for (const log of logs) {
    if (RETIRED_SOURCES.has(log.source_name)) continue; // 퇴역 소스 — 계속 경보에 뜨지 않게 제외
    if (log.run_date < sinceHist) continue; // historyDays 밖 — 퇴역 소스는 아예 제외
    const n = Number(log.total_saved) || 0;
    if (log.run_date >= since) {
      recent.set(log.source_name, (recent.get(log.source_name) ?? 0) + n);
    } else {
      older.set(log.source_name, (older.get(log.source_name) ?? 0) + n);
    }
    if (n > 0) {
      const cur = lastSaved.get(log.source_name);
      if (!cur || log.run_date > cur) lastSaved.set(log.source_name, log.run_date);
    }
  }

  const allSources = new Set([...recent.keys(), ...older.keys()]);
  const dead: CrawlSourceStatus[] = [];
  const never: CrawlSourceStatus[] = [];
  const healthy: CrawlSourceStatus[] = [];

  for (const source of allSources) {
    const savedLast3d = recent.get(source) ?? 0;
    const savedOlder = older.get(source) ?? 0;
    const entry: CrawlSourceStatus = {
      source_name: source,
      lastSaved: lastSaved.get(source) ?? null,
      savedLast3d,
      savedLast30d: savedLast3d + savedOlder,
    };
    if (savedLast3d === 0 && savedOlder > 0) dead.push(entry);
    else if (savedLast3d === 0 && savedOlder === 0) never.push(entry);
    else healthy.push(entry);
  }

  const bySourceName = (a: CrawlSourceStatus, b: CrawlSourceStatus) =>
    a.source_name.localeCompare(b.source_name);
  dead.sort(bySourceName);
  never.sort(bySourceName);
  healthy.sort(bySourceName);

  return { dead, never, healthy };
}

// crawl_logs에는 소스 "그룹"명(공식페이지·SNS세션 등)으로 적재되는데, auditions.source_name
// 접두는 그 그룹 안의 개별 소스명(기획사:xx, 인스타그램:@yy …)이다. 표를 auditions 접두 기준으로
// 그리면 그룹명↔접두가 어긋나 (a) 이 접두들은 상태가 영구 "—"로 뜨고 (b) 공식페이지·역추적·
// SNS세션 자체는 표에 아예 안 나온다. auditions 접두 → crawl_logs 그룹명 매핑.
//
// 정본: crawler/scrapers/official_pages.py Page.kind(기획사·공공, 방송사는 정의만 있고 미사용)
//       crawler/sns_sources/session_browser.py source_name="SNS세션"
//       crawler/sns_sources/instagram_caption.py _PLATFORM_LABEL(인스타그램·스레드·X)
// 소스명이 바뀌면 이 표도 같이 바꿀 것.
export const CRAWL_GROUP_OF_PREFIX: Readonly<Record<string, string>> = {
  기획사: "공식페이지",
  공공: "공식페이지",
  방송사: "공식페이지",
  인스타그램: "SNS세션",
  스레드: "SNS세션",
  X: "SNS세션",
};

// crawl_logs에는 있지만("역추적") auditions 접두로는 절대 나타나지 않는 그룹.
// 역추적은 애그리게이터 제목으로 원글을 찾기만 하고(저장 X), 찾은 원글은 그 원 출처
// 접두(예: 네이버카페:xx)로 저장된다 — crawler/sns_sources/backtrace.py 참고.
export const CRAWL_ONLY_GROUP_NOTE: Readonly<Record<string, string>> = {
  역추적: "저장분은 네이버카페 그룹에 합산됨 — 원글 발견만 하고 별도 저장은 안 함",
};
