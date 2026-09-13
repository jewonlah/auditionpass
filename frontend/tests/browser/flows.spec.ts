import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import PDFDocument from "pdfkit";

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

test("자료 보관함: 업로드·재조회·분류·다운로드·삭제와 잘못된 파일 차단", async ({ page }) => {
  await login(page);
  await page.goto("/portfolio");
  await page.getByRole("link", { name: /내 자료 보관함/ }).click();
  await expect(page.getByRole("heading", { name: "내 자료 보관함" })).toBeVisible();
  await expect(page.getByRole("main").getByText("아직 보관한 자료가 없어요")).toBeVisible();
  const fileInput = page.getByLabel("보관할 파일 선택");
  await fileInput.setInputFiles({ name: "invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("fake PDF") });
  await expect(page.getByRole("alert").filter({ hasText: "파일 내용과 형식이 맞지 않아요" })).toBeVisible();
  await fileInput.setInputFiles({ name: "연기 프로필.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nmaterial library test") });
  await expect(page.getByRole("status")).toContainText("보관했어요");
  await page.reload();
  await expect(page.getByRole("heading", { name: "연기 프로필.pdf" })).toBeVisible();
  await page.getByRole("combobox", { name: "자료 종류", exact: true }).selectOption("photo");
  await expect(page.getByRole("main").getByText("이 종류의 자료는 아직 없어요")).toBeVisible();
  await page.getByRole("combobox", { name: "자료 종류", exact: true }).selectOption("document");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "연기 프로필.pdf 다운로드" }).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  const absent = await page.request.get("/api/materials/99999999-9999-4999-8999-999999999999");
  expect(absent.status()).toBe(404);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/material-library-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "연기 프로필.pdf 삭제", exact: true }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("heading", { name: "연기 프로필.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "연기 프로필.pdf 삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "연기 프로필.pdf" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("main").getByText("아직 보관한 자료가 없어요")).toBeVisible();
});

test("포트폴리오: 저장본 PDF와 편집 복귀 경로를 연결한다", async ({ page }) => {
  await login(page);
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "내 포트폴리오", exact: true })).toBeVisible();
  // Current profile and stored version deliberately have different names in the fixture.
  await expect(page.getByRole("heading", { name: "이전 지원자의 포트폴리오" })).toBeVisible();
  const pdfResponse = page.waitForResponse((response) => response.url().includes("/api/profile/pdf?versionId=44444444-4444-4444-8444-444444444444"));
  await page.getByRole("button", { name: "제출 PDF 미리보기" }).click();
  expect((await pdfResponse).status()).toBe(200);
  await expect(page.getByRole("link", { name: "PDF 다운로드" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("페이지를 표시했어요.");
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0 && pixels[i] < 180) dark++;
    return dark;
  })).toBeGreaterThan(100);
  await expect(page.getByRole("link", { name: "포트폴리오 편집하기" })).toHaveAttribute("href", "/profile?returnTo=%2Fportfolio");
  await expect(page.getByRole("link", { name: "내 정보", exact: true })).toHaveAttribute("href", "/my");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/portfolio-mobile.png", fullPage: true });
});

test("포트폴리오: 여러 PDF 페이지와 읽기 실패 안내", async ({ page }) => {
  await login(page);
  const pdf = new PDFDocument();
  const chunks: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve) => { pdf.on("data", (chunk: Buffer) => chunks.push(chunk)); pdf.on("end", () => resolve(Buffer.concat(chunks))); });
  pdf.text("First portfolio page");
  pdf.addPage().text("Second portfolio page");
  pdf.end();
  const body = await bytes;
  await page.route("**/api/profile/pdf?*", (route) => route.fulfill({ body, contentType: "application/pdf" }));
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "제출 PDF 미리보기" }).click();
  await expect(page.getByRole("status")).toHaveText("PDF 2페이지를 표시했어요.");
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.getByText("Second portfolio page", { exact: true })).toBeAttached();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await expect(page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "포트폴리오" })).toHaveAttribute("aria-current", "page");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("link", { name: "포트폴리오 편집하기" }).focus();
  await expect(page.getByRole("link", { name: "포트폴리오 편집하기" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "포트폴리오 편집", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "포트폴리오로 돌아가기" }).click();
  await page.unroute("**/api/profile/pdf?*");
  await page.route("**/api/profile/pdf?*", (route) => route.fulfill({ body: "broken PDF", contentType: "application/pdf" }));
  await page.getByRole("button", { name: "제출 PDF 미리보기" }).click();
  await expect(page.getByRole("button", { name: "페이지 다시 불러오기" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("페이지를 표시하지 못했어요.");
  await expect(page.getByRole("link", { name: "PDF 다운로드" })).toBeVisible();
});

test("내비게이션: 본문 스크롤과 마지막 저장 버튼이 메뉴에 가리지 않는다", async ({ page }) => {
  await login(page);
  await page.goto("/profile");
  const main = page.locator("#app-content");
  const nav = page.getByRole("navigation", { name: "주 메뉴" });
  await expect(page.locator(".app-theme")).toHaveCSS("background-color", "rgb(242, 240, 248)");
  await expect(page.getByLabel("이름 *", { exact: true })).toHaveValue("Test Actor");
  const initialNav = await nav.boundingBox();
  await page.mouse.move(180, 350);
  await page.mouse.wheel(0, 800);
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  expect((await nav.boundingBox())!.y).toBe(initialNav!.y);
  for (const height of [844, 420]) {
    await page.setViewportSize({ width: 390, height });
    const save = page.getByRole("button", { name: "프로필 수정", exact: true });
    await save.focus();
    await save.scrollIntoViewIfNeeded();
    const saveBox = (await save.boundingBox())!;
    const navBox = (await nav.boundingBox())!;
    expect(saveBox.y).toBeGreaterThanOrEqual((await main.boundingBox())!.y);
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(navBox.y);
    await expect(save).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await main.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: "test-results/navigation-scroll-bottom.png" });
  await page.getByLabel("교육·트레이닝 이력").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/audition-materials-form.png" });
  await nav.getByRole("link", { name: "포트폴리오" }).click();
  await expect(page.getByRole("heading", { name: "내 포트폴리오", exact: true })).toBeInViewport();
});

test("프로필: 숫자 AI 요청, 초안 확인, 선택 항목 비우기, 미리보기", async ({ page }) => {
  await login(page);
  let saved: Record<string, unknown> | undefined;
  let generated: Record<string, unknown> | undefined;
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PUT") { saved = route.request().postDataJSON(); return route.fulfill({ json: { profile: saved } }); }
    return route.fulfill({ json: { profile: saved ?? { id: userId, name: "테스트 지원자", birth_year: 2000, gender: "여성", genre: ["성우"], specialty: [], photo_urls: [], bio: "직접 쓴 소개" } } });
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
  await page.getByLabel("교육·트레이닝 이력").fill("2025년 발성 수업 6개월");
  await page.getByLabel("자기소개 영상 링크").fill("https://example.com/intro");
  await page.getByLabel("연기·노래·댄스 영상 링크").fill("https://example.com/acting");
  await page.getByLabel("음성·보컬 샘플 링크").fill("https://example.com/voice");
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
  expect(saved?.training).toBe("2025년 발성 수업 6개월");
  expect(saved?.introduction_url).toBe("https://example.com/intro");
  expect(saved?.performance_url).toBe("https://example.com/acting");
  expect(saved?.audio_url).toBe("https://example.com/voice");
  await page.goto("/profile");
  await expect(page.getByLabel("교육·트레이닝 이력")).toHaveValue("2025년 발성 수업 6개월");
  await expect(page.getByLabel("음성·보컬 샘플 링크")).toHaveValue("https://example.com/voice");
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

test("지원 확인: 사용자가 선택한 보관 자료만 요청에 포함한다", async ({ page }) => {
  await login(page);
  await page.route("**/api/apply/check?*", (route) => route.fulfill({ json: { hasApplied: false, isSending: false, missingFields: [], profileSummary: { name: "테스트 지원자", birthYear: 2000, gender: "여성", genre: ["성우"], photoCount: 0 } } }));
  const ids = ["11111111-1111-4111-8111-111111111110", "11111111-1111-4111-8111-111111111112", "11111111-1111-4111-8111-111111111113", "11111111-1111-4111-8111-111111111114"];
  await page.route("**/api/materials", (route) => route.fulfill({ json: { materials: ids.map((id, index) => ({ id, name: `자료${index + 1}.pdf`, kind: "document", size_bytes: 10 })) } }));
  let submitted: string[] = [];
  await page.route("**/api/apply", (route) => { submitted = route.request().postDataJSON().materialIds; return route.fulfill({ status: 202, json: { pending: true, code: "SEND_PENDING" } }); });
  await page.goto("/audition/" + auditionId);
  await page.getByRole("button", { name: "원클릭 지원", exact: true }).click();
  for (const name of ["자료1.pdf", "자료2.pdf", "자료3.pdf"]) await page.getByRole("checkbox", { name }).check();
  await expect(page.getByRole("checkbox", { name: "자료4.pdf" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "자료2.pdf" }).uncheck();
  await page.getByRole("button", { name: "지원 발송", exact: true }).click();
  await expect(page.getByRole("link", { name: "지원 내역에서 결과 확인하기" })).toBeVisible();
  expect(submitted).toEqual([ids[0], ids[2]]);
});

test("유입 가이드: 로그인 없이 분야별 공고와 포트폴리오 진입을 제공한다", async ({ page }) => {
  await page.goto("/start?utm_source=instagram&utm_medium=social&utm_campaign=launch");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("오디션 준비부터 지원까지");
  await expect(page.getByRole("link", { name: "배우 오디션", exact: true })).toHaveAttribute("href", "/auditions/actor");
  await expect(page.getByRole("link", { name: "내 포트폴리오 준비하기" })).toHaveAttribute("href", "/portfolio");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ap_attribution_v1")!).utm.utm_campaign)).toBe("launch");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
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
  await page.route("http://127.0.0.1:15439/auth/v1/recover*", (route) => { requested = true; return route.fulfill({ json: {} }); });
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
  await expect(page.getByLabel("3:4 비율로 자르기")).not.toBeChecked();
  await page.getByLabel("3:4 비율로 자르기").check();
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

test("사진은 기본 업로드에서 가로·세로 전체 구도를 보존한다", async ({ page }) => {
  await login(page);
  await page.route("**/api/profile", (route) => route.fulfill({ json: { profile: { id: userId, name: "구도 테스트", birth_year: 2000, gender: "여성", genre: ["배우"], photo_urls: [], specialty: [] } } }));
  await page.goto("/profile");
  for (const [width, height] of [[1200, 800], [600, 1200]]) {
    const buffer = await sharp({ create: { width, height, channels: 3, background: "#aaccdd" } }).png().toBuffer();
    await page.locator('input[type="file"]').setInputFiles({ name: `whole-${width}.png`, mimeType: "image/png", buffer });
    await expect(page.getByLabel("3:4 비율로 자르기")).not.toBeChecked();
    await expect(page.getByRole("img", { name: "업로드할 사진의 자르기 미리보기" })).toHaveCSS("object-fit", "contain");
    const uploaded = page.waitForResponse((res) => res.url().endsWith("/api/profile/photos") && res.request().method() === "POST");
    await page.getByRole("button", { name: "이 사진 사용하기" }).click();
    const response = await uploaded;
    expect(response.status()).toBe(201);
    const data = await response.json();
    expect([data.width, data.height]).toEqual([width, height]);
  }
  const photo = page.getByRole("img", { name: "대표 프로필 사진", exact: true });
  await expect(photo).toHaveCSS("object-fit", "contain");
  const imageBox = await photo.boundingBox();
  const buttonBox = await page.getByRole("button", { name: "대표 사진", exact: true }).boundingBox();
  expect(imageBox).not.toBeNull();
  expect(buttonBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height);
});

// Last in this single-worker suite: deletion intentionally seals the mock account.
test("탈퇴는 진행 중 파일을 기다리고 새 PDF와 사진 업로드를 차단한다", async ({ page }) => {
  await login(page);
  const rpcUrl = "http://127.0.0.1:15439/rest/v1/rpc/";
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
