import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";

test("sitemap uses current public rows across pages and rejects partial query failures", async t => {
  let failure = false;
  let revision = "first";
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname.endsWith("/community_posts")) return res.end("[]");
    assert.equal(url.searchParams.get("is_active"), "eq.true");
    assert.equal(url.searchParams.get("review_status"), "in.(auto,approved)");
    assert.match(url.searchParams.get("or") ?? "", /deadline.gte.\d{4}-\d{2}-\d{2},deadline.is.null/);
    assert.equal(url.searchParams.get("order"), "created_at.desc,id.asc");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (failure && offset > 0) { res.statusCode = 500; return res.end('{"message":"unavailable"}'); }
    const rows = Array.from({ length: offset === 0 ? 1000 : 2 }, (_, i) => ({ id: `${revision}-${offset + i}`, created_at: "2026-09-20T00:00:00Z", genre: "배우", category: "배우" }));
    res.end(JSON.stringify(rows));
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-key";
  t.after(() => { server.closeAllConnections(); server.close(); if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous; if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey; });
  const { default: sitemap, dynamic } = await import("../../app/sitemap");
  assert.equal(dynamic, "force-dynamic");
  const first = await sitemap();
  assert.equal(first.filter(row => row.url.includes("/audition/")).length, 1002);
  assert.equal(new Set(first.map(row => row.url)).size, first.length);
  revision = "second";
  const second = await sitemap();
  assert.ok(second.some(row => row.url.endsWith("/second-1001")));
  assert.ok(!second.some(row => row.url.includes("/first-")));
  failure = true;
  await assert.rejects(sitemap(), /Sitemap audition query failed/);
});
