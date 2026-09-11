import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

const userId = "11111111-1111-4111-8111-111111111111";
const auditionId = "22222222-2222-4222-8222-222222222222";
const audition = { id: auditionId, title: "테스트 성우 오디션", company: "테스트 제작사", genre: "기타", category: "성우", deadline: "2099-12-31", is_active: true, apply_type: "email", oneclick_blocked: false, review_status: "approved", reports_count: 0, created_at: "2026-01-01T00:00:00Z" };

async function login(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: userId, exp, aud: "authenticated", role: "authenticated" })).toString("base64url") + ".local";
  const session = { access_token: token, refresh_token: "local-refresh", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: userId, email: "local@example.invalid", aud: "authenticated", app_metadata: {}, user_metadata: {} } };
  await page.context().addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "127.0.0.1", path: "/" }]);
  await page.route("**/api/bookmarks", (route) => route.fulfill({ json: { ids: [] } }));
}

test("프로필: 숫자 AI 요청, 초안 확인, 선택 항목 비우기, 미리보기", async ({ page }) => {
  await login(page);
  let saved: Record<string, unknown> | undefined;
  let generated: Record<string, unknown> | undefined;
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PUT") { saved = route.request().postDataJSON(); return route.fulfill({ json: { profile: saved } }); }
    return route.fulfill({ json: { profile: { id: userId, name: "테스트 지원자", birth_year: 2000, gender: "여성", genre: ["성우"], specialty: [], photo_urls: [], bio: "직접 쓴 소개" } } });
  });
  await page.route("**/api/profile/polish", (route) => { generated = route.request().postDataJSON(); return route.fulfill({ json: { bio: "목소리로 이야기를 전합니다." } }); });
  await page.goto("/profile");
  await page.getByLabel("키 (cm)").fill("170");
  await page.getByRole("button", { name: "AI 소개 초안 만들기" }).click();
  await expect(page.getByText("AI가 제안한 소개")).toBeVisible();
  expect(generated?.height).toBe(170);
  expect(generated?.birth_year).toBe(2000);
  await expect(page.locator("textarea").first()).toHaveValue("직접 쓴 소개");
  await page.getByRole("button", { name: "이 소개 사용하기" }).click();
  await expect(page.locator("textarea").first()).toHaveValue("목소리로 이야기를 전합니다.");
  await page.getByLabel("키 (cm)").fill("");
  await page.getByLabel("몸무게 (kg)").fill("50");
  await page.getByLabel("몸무게 (kg)").fill("");
  await page.getByRole("button", { name: "내 프로필 미리보기" }).click();
  await page.getByRole("radio", { name: /경력 중심/ }).check();
  await expect(page.getByRole("article", { name: "프로필 구성 미리보기" })).toHaveAttribute("data-template", "career");
  await expect(page.getByRole("article", { name: "프로필 구성 미리보기" })).toContainText("테스트 지원자");
  await page.screenshot({ path: "test-results/profile-preview.png", fullPage: true });
  await page.getByRole("button", { name: "프로필 수정", exact: true }).click();
  await expect.poll(() => saved?.height).toBe(null);
  expect(saved?.weight).toBe(null);
  expect(saved?.genre).toEqual(["성우"]);
  expect(saved?.template_id).toBe("career");
});

test("지원: 202 대기는 완료로 표시하지 않는다", async ({ page }) => {
  await login(page);
  await page.route("**/api/apply/check?*", (route) => route.fulfill({ json: { hasApplied: false, isSending: false, missingFields: [], profileSummary: { name: "테스트 지원자", birthYear: 2000, gender: "여성", genre: ["성우"], photoCount: 0 } } }));
  await page.route("**/api/apply", (route) => route.fulfill({ status: 202, json: { pending: true, code: "SEND_PENDING", error: "발송 결과를 확인 중입니다." } }));
  await page.goto("/audition/" + auditionId);
  await page.getByRole("button", { name: "원클릭 지원", exact: true }).click();
  await page.getByRole("button", { name: "지원 발송", exact: true }).click();
  await expect(page.getByRole("link", { name: "지원 내역에서 결과 확인하기" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "지원 완료", exact: true })).toHaveCount(0);
});

test("찜: 목록에서 저장하고 지원 탭에서 다시 찾는다", async ({ page }) => {
  await login(page);
  let saved = false;
  await page.route("**/api/bookmarks*", (route) => {
    if (route.request().method() === "POST") { saved = true; return route.fulfill({ json: { saved } }); }
    if (route.request().url().includes("page=")) return route.fulfill({ json: { bookmarks: saved ? [{ id: "bookmark1", audition }] : [], hasMore: false } });
    return route.fulfill({ json: { ids: saved ? [auditionId] : [] } });
  });
  await page.route("**/api/history", (route) => route.fulfill({ json: { applications: [] } }));
  await page.goto("/auditions");
  await page.getByRole("button", { name: "공고 찜하기" }).first().click();
  await expect(page.getByRole("button", { name: "찜 해제" }).first()).toHaveAttribute("aria-pressed", "true");
  await page.goto("/applications");
  await page.getByRole("button", { name: "찜", exact: true }).click();
  await expect(page.getByRole("heading", { name: audition.title })).toBeVisible();
});

test("계정 복구: 안내 메일은 로컬 mock에서만 처리한다", async ({ page }) => {
  let requested = false;
  await page.route("http://127.0.0.1:55439/auth/v1/recover*", (route) => { requested = true; return route.fulfill({ json: {} }); });
  await page.goto("/forgot-password");
  await page.getByLabel("가입한 이메일").fill("local@example.invalid");
  await page.getByRole("button", { name: "안내 메일 받기" }).click();
  await expect(page.getByRole("status")).toContainText("안내 메일");
  expect(requested).toBe(true);
});

test("지원 기록에서 당시 프로필 버전의 정보와 스타일을 확인한다", async ({ page }) => {
  await login(page);
  const versionId = "44444444-4444-4444-8444-444444444444";
  await page.route("**/api/history", (route) => route.fulfill({ json: { applications: [{ id: "application1", status: "sent", profile_version_id: versionId, audition }] } }));
  await page.goto("/applications");
  await page.getByRole("link", { name: "이 지원에 사용한 프로필 보기" }).click();
  await expect(page.getByRole("heading", { name: "저장한 프로필", exact: true })).toBeVisible();
  const preview = page.getByRole("article", { name: "프로필 구성 미리보기" });
  await expect(preview).toHaveAttribute("data-template", "career");
  await expect(preview).toContainText("이전 지원자");
  await expect(preview).toContainText("저장 당시 소개입니다.");
  const responsePromise = page.waitForResponse((res) => res.url().includes("/api/profile/pdf?") && res.status() === 200);
  await page.getByRole("button", { name: "제출 PDF 미리보기" }).click();
  const response = await responsePromise;
  expect(response.headers()["content-type"]).toContain("application/pdf");
  // Chrome's native PDF viewer may omit PDF bodies from DevTools; validate via the API client.
  const firstPdf = await (await page.request.get(`/api/profile/pdf?versionId=${versionId}`)).body();
  expect(firstPdf.subarray(0, 5).toString()).toBe("%PDF-");
  const again = await page.request.get(`/api/profile/pdf?versionId=${versionId}`);
  expect((await again.body()).equals(firstPdf)).toBe(true);
  await expect(page.getByRole("link", { name: "PDF 다운로드" })).toBeVisible();
  const blobUrl = await page.getByRole("link", { name: "PDF 다운로드" }).getAttribute("href");
  const visibleBytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer()).slice(0, 5)), blobUrl);
  expect(visibleBytes).toEqual([37,80,68,70,45]);
});

test("사진 크롭 위치를 골라 실제 업로드하고 저장 잠금을 해제한다", async ({ page }) => {
  await login(page);
  await page.route("**/api/profile", (route) => route.fulfill({ json: { profile: { id: userId, name: "사진 테스트", birth_year: 2000, gender: "여성", genre: ["배우"], photo_urls: [], specialty: [] } } }));
  await page.goto("/profile");
  const buffer = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#dfc9b4" } }).png().toBuffer();
  await page.locator('input[type="file"]').setInputFiles({ name: "crop.png", mimeType: "image/png", buffer });
  await expect(page.getByRole("button", { name: "프로필 수정", exact: true })).toBeDisabled();
  await page.getByRole("slider", { name: "좌우 위치" }).press("End");
  const uploaded = page.waitForResponse((res) => res.url().endsWith("/api/profile/photos") && res.request().method() === "POST");
  await page.getByRole("button", { name: "이 사진 사용하기" }).click();
  const response = await uploaded;
  expect(response.status()).toBe(201);
  const data = await response.json();
  expect([data.width, data.height]).toEqual([600,800]);
  const remove = await page.request.delete("/api/profile/photos", { data: { url: data.url } });
  expect(remove.status()).toBe(409);
  expect((await remove.json()).code).toBe("PHOTO_RETENTION_REQUIRED");
  expect((await page.request.get(data.url)).status()).toBe(200);
  await expect(page.getByRole("img", { name: "대표 프로필 사진", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "프로필 수정", exact: true })).toBeEnabled();
});

// Last in this single-worker suite: deletion intentionally seals the mock account.
test("탈퇴는 진행 중 파일을 기다리고 새 PDF와 사진 업로드를 차단한다", async ({ page }) => {
  await login(page);
  const rpcUrl = "http://127.0.0.1:55439/rest/v1/rpc/";
  const operation = await page.request.post(rpcUrl + "begin_account_file_operation", { data: { p_user_id: userId } });
  expect(operation.ok()).toBe(true);
  const operationId = await operation.json();
  try {
    const deletion = await page.request.post("/api/account/delete");
    expect(deletion.status()).toBe(409);
    expect((await deletion.json()).code).toBe("FILE_OPERATIONS_PENDING");
    const pdf = await page.request.get("/api/profile/pdf?versionId=44444444-4444-4444-8444-444444444444");
    expect(pdf.status()).toBe(503);
    const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const photo = await page.request.post("/api/profile/photos", { multipart: { file: { name: "blocked.png", mimeType: "image/png", buffer } } });
    expect(photo.status()).toBe(503);
  } finally {
    await page.request.post(rpcUrl + "finish_account_file_operation", { data: { p_user_id: userId, p_operation_id: operationId } });
  }
  const ready = await page.request.post(rpcUrl + "begin_account_file_deletion", { data: { p_user_id: userId } });
  expect(await ready.json()).toBe(true);
});
