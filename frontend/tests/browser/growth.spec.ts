import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  const id = "11111111-1111-4111-8111-111111111111";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: id, exp, aud: "authenticated", role: "authenticated" })).toString("base64url") + ".local";
  const session = { access_token: token, refresh_token: "local-refresh", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id, email: "local@example.invalid", aud: "authenticated", app_metadata: {}, user_metadata: {} } };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" }]);
}

test.beforeEach(async ({ page }) => {
  // No telemetry ever leaves the local test: replace the loader and block collection.
  await page.route("https://www.googletagmanager.com/**", route => route.fulfill({ contentType: "application/javascript", body: 'document.documentElement.dataset.gaLoaded="1";' }));
  await page.route(/https:\/\/[^/]*google-analytics\.com\//, route => route.abort());
});

const signupEvents = (page: Page) => page.evaluate(() => (window.dataLayer ?? []).map(entry => Array.from(entry as ArrayLike<unknown>)).filter(entry => entry[0] === "event" && entry[1] === "sign_up"));

test("신규 가입: 실제 앱 API를 거쳐 한 번만 기록하고 새로고침·다른 탭은 중복 제외", async ({ page, context }) => {
  await login(page);
  const claimed = page.waitForResponse(response => response.url().endsWith("/api/analytics/signup"));
  await page.goto("/start");
  expect((await claimed).status()).toBe(200);
  await expect.poll(() => signupEvents(page)).toEqual([["event", "sign_up", { method: "email" }]]);
  const repeated = page.waitForResponse(response => response.url().endsWith("/api/analytics/signup"));
  await page.reload();
  expect(await (await repeated).json()).toEqual({ event: null });
  expect(await signupEvents(page)).toEqual([]);
  const second = await context.newPage();
  await second.route("https://www.googletagmanager.com/**", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  const again = second.waitForResponse(response => response.url().endsWith("/api/analytics/signup"));
  await second.goto("/start");
  expect(await (await again).json()).toEqual({ event: null });
  expect(await signupEvents(second)).toEqual([]);
});

test("계측 API: 비로그인 및 다른 출처 요청 거절", async ({ request }) => {
  const anonymous = await request.post("/api/analytics/signup", { headers: { origin: "http://127.0.0.1:3108" } });
  expect(anonymous.status()).toBe(401);
  const crossOrigin = await request.post("/api/analytics/signup", { headers: { origin: "https://example.invalid" } });
  expect(crossOrigin.status()).toBe(403);
});

test("GA 로더 차단: 가입 계측을 소비하지 않고 화면 이용 가능", async ({ page }) => {
  await login(page);
  await page.route("https://www.googletagmanager.com/**", route => route.abort());
  const claims: string[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/analytics/signup")) claims.push(request.url()); });
  await page.goto("/start");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("오디션 준비부터 지원까지");
  await page.getByRole("link", { name: "배우 오디션", exact: true }).click();
  await expect(page).toHaveURL(/\/auditions\/actor/);
  expect(claims).toEqual([]);
});

test("계정 복구 화면에서는 가입 이벤트를 소비하지 않는다", async ({ page }) => {
  await login(page);
  const claims: string[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/analytics/signup")) claims.push(request.url()); });
  await page.goto("/reset-password");
  await expect(page.locator("html")).toHaveAttribute("data-ga-loaded", "1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(claims).toEqual([]);
});
