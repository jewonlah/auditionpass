import { test, expect } from "@playwright/test";

test("paused deployment rejects send and recovery while preserving login and protected pages", async ({ request }) => {
  for (const path of ["/api/apply", "/api/apply/prepare", "/api/apply/recover"]) {
    const response = await request.post(path, { data: {} });
    expect(response.status()).toBe(503);
    expect((await response.json()).code).toBe("APPLICATION_PAUSED");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["retry-after"]).toBe("300");
  }
  const check = await request.get("/api/apply/check?auditionId=test");
  expect(check.status()).toBe(503);
  expect((await check.json()).code).toBe("APPLICATION_PAUSED");
  expect((await request.get("/login")).status()).toBe(200);
  for (const path of ["/profile", "/applications"]) {
    const page = await request.get(path, { maxRedirects: 0 });
    expect(page.status()).toBe(307);
    expect(page.headers().location).toContain("/login?returnTo=");
  }
  const state = await (await request.get("http://127.0.0.1:15439/__qa/state")).json();
  expect(state.claimCalls).toBe(0);
});
