import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("제출: PDF 확인과 묶음 확인·동의 전에는 발송하지 않는다", async ({ page }) => {
  const id = "11111111-1111-4111-8111-111111111111", auditionId = "22222222-2222-4222-8222-222222222222";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: id, exp, aud: "authenticated", role: "authenticated" })).toString("base64url") + ".local";
  const session = { access_token: token, refresh_token: "local-refresh", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id, email: "local@example.invalid", aud: "authenticated", app_metadata: {}, user_metadata: {} } };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" }]);
  await page.route("https://www.googletagmanager.com/**", route => route.abort());
  await page.route(/https:\/\/[^/]*google-analytics\.com\//, route => route.abort());
  await page.route("**/api/apply/check?*", route => route.fulfill({ json: { hasApplied: false, isSending: false, missingFields: [],
    readiness: { issues: [], requirements:{minAge:null,maxAge:null,minorRole:false,requiredMaterials:[],requiredGender:null,requireCareer:false,acknowledgements:[],ageScope:"source"} },
    profileSummary: { name: "서지안", documentVersion: 1, profileVersionId: "44444444-4444-4444-8444-444444444444", birthYear: 1998, gender: "여성", genre: ["배우"], photoCount: 3 },
  } }));
  const pdf = await readFile("../output/pdf/compcards/classic-actor.pdf");
  await page.route("**/api/profile/pdf?*", route => route.fulfill({ body: pdf, contentType: "application/pdf" }));
  await page.route("**/api/apply/prepare", route => route.fulfill({ json: { preparationId: "55555555-5555-4555-8555-555555555555", recipient: "recipient@example.invalid", replyTo: "local@example.invalid", subject: "가상 지원 검증", attachments: ["profile.pdf"] } }));
  let sends = 0;
  await page.route("**/api/apply", async route => {
    expect(route.request().postDataJSON()).toEqual({ preparationId: "55555555-5555-4555-8555-555555555555", consent: true });
    sends++;
    await route.fulfill({ status: 202, json: { pending: true, code: "SEND_PENDING", error: "발송 결과 확인 중" } });
  });
  await page.goto(`/audition/${auditionId}`);
  await page.getByRole("button", { name: "지원 준비", exact: true }).click();
  const prepare = page.getByRole("button", { name: "수신처와 첨부파일 확인하기" });
  await expect(prepare).toBeDisabled();
  await page.getByRole("button", { name: "제출 PDF 미리보기" }).click();
  await expect(prepare).toBeEnabled();
  await prepare.click();
  await expect(page.getByText("답장받을 주소: local@example.invalid")).toBeVisible();
  const send = page.getByRole("button", { name: "이 내용으로 지원 보내기" });
  await expect(send).toBeDisabled();
  expect(sends).toBe(0);
  await page.getByRole("checkbox").check();
  await send.click();
  await expect(page.getByRole("link", { name: "지원 내역에서 결과 확인하기" })).toBeVisible();
  expect(sends).toBe(1);
  const closedId = "66666666-6666-4666-8666-666666666666";
  const base = { company: "QA", genre: "배우", category: "배우", deadline: null, created_at: "2026-01-01", oneclick_blocked: false, application_ready: false, reports_count: 0 };
  const open = { ...base, id: auditionId, title: "공개 검수 공고", is_active: true, is_public: true, review_status: "approved", source_url: "https://example.invalid/source" };
  const closed = { ...base, id: closedId, title: "종료된 지원 공고", is_active: false, is_public: false, source_url: null };
  await page.route("**/api/bookmarks*", route => route.fulfill({ json: route.request().url().includes("page=") ? { bookmarks: [{ audition: open }, { audition: closed }], hasMore: false } : { ids: [auditionId, closedId] } }));
  await page.route("**/api/history", route => route.fulfill({ json: { applications: [{ id: closedId, status: "failed", send_stopped: true, created_at: "2026-01-01", audition: closed }] } }));
  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: closed.title })).toBeVisible();
  await expect(page.locator(`a[href="/audition/${closedId}"]`)).toHaveCount(0);
  await expect(page.getByText("추가 발송 중지", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "찜", exact: true }).click();
  await expect(page.getByText("검수 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("주의 필요", { exact: true })).toHaveCount(0);
  await expect(page.locator(`a[href="/audition/${auditionId}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/audition/${closedId}"]`)).toHaveCount(0);
});
