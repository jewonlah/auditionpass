// crawl-health 포팅 회귀 테스트.
// crawler/utils/crawl_log.py의 dead_sources()와 규칙을 이중 유지하므로
// 한쪽만 바뀌면 여기서 깨져야 한다(사망/미개통이 섞이면 진짜 경보가 묻힌다).

import test from "node:test";
import assert from "node:assert/strict";
import { classifySources, fetchCrawlLogs, type CrawlLogRow } from "./crawl-health";

const NOW = new Date("2026-09-03T00:00:00Z"); // KST 무관, 순수 날짜 연산만 테스트

test("최근 3일 0건이지만 30일 내 저장 이력 있으면 사망", () => {
  const logs: CrawlLogRow[] = [{ source_name: "필메코", run_date: "2026-08-10", total_saved: 5 }];
  const { dead, never, healthy } = classifySources(logs, NOW);
  assert.equal(dead.length, 1);
  assert.equal(dead[0].source_name, "필메코");
  assert.equal(dead[0].lastSaved, "2026-08-10");
  assert.equal(dead[0].savedLast3d, 0);
  assert.equal(dead[0].savedLast30d, 5);
  assert.equal(never.length, 0);
  assert.equal(healthy.length, 0);
});

test("30일 내내 저장 0건이면 미개통", () => {
  const logs: CrawlLogRow[] = [
    { source_name: "미개통소스", run_date: "2026-08-20", total_saved: 0 },
  ];
  const { dead, never } = classifySources(logs, NOW);
  assert.equal(dead.length, 0);
  assert.equal(never.length, 1);
  assert.equal(never[0].source_name, "미개통소스");
  assert.equal(never[0].lastSaved, null);
  assert.equal(never[0].savedLast3d, 0);
  assert.equal(never[0].savedLast30d, 0);
});

test("최근 3일 안에 저장이 있으면 정상", () => {
  const logs: CrawlLogRow[] = [
    { source_name: "정상소스", run_date: "2026-09-02", total_saved: 10 },
  ];
  const { healthy } = classifySources(logs, NOW);
  assert.equal(healthy.length, 1);
  assert.equal(healthy[0].source_name, "정상소스");
  assert.equal(healthy[0].savedLast3d, 10);
  assert.equal(healthy[0].savedLast30d, 10);
});

test("historyDays(30일) 밖 로그만 있는 퇴역 소스는 결과에서 제외된다", () => {
  const logs: CrawlLogRow[] = [
    { source_name: "퇴역소스", run_date: "2026-07-20", total_saved: 5 },
  ];
  const { dead, never, healthy } = classifySources(logs, NOW);
  assert.equal(dead.length, 0);
  assert.equal(never.length, 0);
  assert.equal(healthy.length, 0);
});

test("경계: 정확히 3일 전 저장은 '최근 3일'에 포함되어 정상 판정", () => {
  const logs: CrawlLogRow[] = [
    { source_name: "경계소스", run_date: "2026-08-31", total_saved: 3 }, // NOW - 3일
  ];
  const { dead, healthy } = classifySources(logs, NOW);
  assert.equal(dead.length, 0);
  assert.equal(healthy.length, 1);
  assert.equal(healthy[0].savedLast3d, 3);
});

test("경계: 4일 전 저장만 있으면 최근 3일에 안 잡혀 사망", () => {
  const logs: CrawlLogRow[] = [
    { source_name: "경계소스4일", run_date: "2026-08-30", total_saved: 3 }, // NOW - 4일
  ];
  const { dead } = classifySources(logs, NOW);
  assert.equal(dead.length, 1);
  assert.equal(dead[0].savedLast3d, 0);
  assert.equal(dead[0].savedLast30d, 3);
});

test("RETIRED_SOURCES(V오디션)는 historyDays 안이어도 결과에서 제외된다", () => {
  const logs: CrawlLogRow[] = [
    { source_name: "V오디션", run_date: "2026-08-10", total_saved: 5 }, // 사망 조건이지만 퇴역 소스
  ];
  const { dead, never, healthy } = classifySources(logs, NOW);
  assert.equal(dead.length, 0);
  assert.equal(never.length, 0);
  assert.equal(healthy.length, 0);
});

// PostgREST 기본 상한(1000행)에 걸려 30일치(≈1,500행)가 단발 조회에서 잘리던 결함(2026-09)의
// 회귀 테스트. range 루프로 페이지를 넘어서까지 전량을 모아오는지 확인한다.
function makeFakeSupabase(pages: CrawlLogRow[][]) {
  let callCount = 0;
  const query = {
    select() {
      return query;
    },
    gte() {
      return query;
    },
    order() {
      return query;
    },
    range(from: number, to: number) {
      const page = pages[callCount] ?? [];
      callCount += 1;
      void from;
      void to;
      return Promise.resolve({ data: page, error: null });
    },
  };
  return {
    from() {
      return query;
    },
    _callCount: () => callCount,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("fetchCrawlLogs: 1000행 초과분도 range 페이지네이션으로 전량 수집한다", async () => {
  const page1: CrawlLogRow[] = Array.from({ length: 1000 }, (_, i) => ({
    source_name: `소스${i}`,
    run_date: "2026-08-20",
    total_saved: 1,
  }));
  const page2: CrawlLogRow[] = [
    { source_name: "필메코", run_date: "2026-08-05", total_saved: 3 },
  ];
  const supabase = makeFakeSupabase([page1, page2]);
  const { data, error } = await fetchCrawlLogs(supabase, "2026-08-01");
  assert.equal(error, null);
  assert.equal(data.length, 1001);
  assert.equal(supabase._callCount(), 2);
});

test("fetchCrawlLogs: 첫 페이지가 1000행 미만이면 더 조회하지 않는다", async () => {
  const page1: CrawlLogRow[] = [
    { source_name: "정상소스", run_date: "2026-08-20", total_saved: 1 },
  ];
  const supabase = makeFakeSupabase([page1]);
  const { data } = await fetchCrawlLogs(supabase, "2026-08-01");
  assert.equal(data.length, 1);
  assert.equal(supabase._callCount(), 1);
});
