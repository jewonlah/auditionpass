import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

test("cutover gate blocks all submission endpoints before auth or side effects", async () => {
  const prior = process.env.APPLICATION_SUBMISSIONS_PAUSED;
  process.env.APPLICATION_SUBMISSIONS_PAUSED = "1";
  try {
    for (const path of ["/api/apply", "/api/apply/", "/api/apply/check?auditionId=test", "/api/apply/prepare", "/api/apply/recover"]) {
      assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: path }), true);
      for (const method of ["GET", "POST", "OPTIONS"]) {
        const response = await proxy(new NextRequest(`http://localhost${path}`, { method }));
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("retry-after"), "300");
        assert.equal((await response.json()).code, "APPLICATION_PAUSED");
      }
    }
    for (const path of ["/api/apply-other", "/api/profile", "/api/history", "/api/webhooks/resend", "/login", "/auditions"]) {
      assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: path }), false);
    }
    assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: "/profile" }), true);
    assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: "/applications" }), true);
  } finally {
    if (prior === undefined) delete process.env.APPLICATION_SUBMISSIONS_PAUSED;
    else process.env.APPLICATION_SUBMISSIONS_PAUSED = prior;
  }
});

test("cutover gate reopens submission routes with their existing handler authentication", async () => {
  const prior = process.env.APPLICATION_SUBMISSIONS_PAUSED;
  try {
    for (const flag of [undefined, "0"]) {
      if (flag === undefined) delete process.env.APPLICATION_SUBMISSIONS_PAUSED;
      else process.env.APPLICATION_SUBMISSIONS_PAUSED = flag;
      for (const path of ["/api/apply", "/api/apply/recover"]) {
        const response = await proxy(new NextRequest(`http://localhost${path}`, { method: "POST" }));
        assert.equal(response.headers.get("x-middleware-next"), "1");
      }
    }
  } finally {
    if (prior === undefined) delete process.env.APPLICATION_SUBMISSIONS_PAUSED;
    else process.env.APPLICATION_SUBMISSIONS_PAUSED = prior;
  }
});
