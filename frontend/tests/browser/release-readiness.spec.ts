import { test, expect, type BrowserContext } from "@playwright/test";

async function login(context: BrowserContext) {
  const id = "11111111-1111-4111-8111-111111111111", exp = Math.floor(Date.now()/1000)+3600;
  const token = Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url")+"."+Buffer.from(JSON.stringify({sub:id,exp,aud:"authenticated",role:"authenticated"})).toString("base64url")+".local";
  const session = { access_token:token,refresh_token:"local-refresh",token_type:"bearer",expires_in:3600,expires_at:exp,user:{id,email:"local@example.invalid",aud:"authenticated",app_metadata:{},user_metadata:{}} };
  await context.addCookies([{name:"sb-127-auth-token",value:"base64-"+Buffer.from(JSON.stringify(session)).toString("base64url"),domain:"127.0.0.1",path:"/"}]);
}
test.afterEach(async ({request}) => { await request.post("http://127.0.0.1:15439/__qa/scenario"); });

test("실제 API: 검증값 비공개, 삭제된 자료와 발송 전 조회 오류는 예약하지 않는다",async ({context,request}) => {
  await login(context);
  await request.post("http://127.0.0.1:15439/__qa/scenario?name=missing-material");
  const check=await context.request.get("/api/apply/check?auditionId=22222222-2222-4222-8222-222222222222");
  expect(check.status()).toBe(200);
  expect((await check.json()).readiness).toEqual({issues:[],subjectRules:{format:"standard",roles:[]}});
  expect(await check.text()).not.toContain("server-only-fingerprint");
  const body={preparationId:"55555555-5555-4555-8555-555555555555",consent:true};
  const missing=await context.request.post("/api/apply",{data:body});
  expect(missing.status()).toBe(409);
  expect((await missing.json()).code).toBe("MATERIAL_CHANGED");
  expect((await (await request.get("http://127.0.0.1:15439/__qa/state")).json()).claimCalls).toBe(0);
  await request.post("http://127.0.0.1:15439/__qa/scenario?name=profile-error");
  const failure=await context.request.post("/api/apply",{data:body});
  expect(failure.status()).toBe(503);
  expect((await failure.json()).code).toBe("PREPARATION_UNAVAILABLE");
  expect(await failure.text()).not.toContain("지원 내역");
  expect((await (await request.get("http://127.0.0.1:15439/__qa/state")).json()).claimCalls).toBe(0);
});

test("서식 중단: 기존 디자인 유지 안내와 이전 서식 선택 가능",async ({context,page,request}) => {
  await login(context);
  await request.post("http://127.0.0.1:15439/__qa/scenario?name=rollback");
  await page.route("https://www.googletagmanager.com/**",r=>r.abort());
  await page.route(/https:\/\/[^/]*google-analytics\.com\//,r=>r.abort());
  await page.goto("/profile");
  await expect(page.getByText("현재 디자인은 유지하며 정보를 수정할 수 있어요.",{exact:false})).toBeVisible();
  await expect(page.locator('input[type="radio"][value="classic"]')).toBeChecked();
  await expect(page.locator('input[type="radio"][value="cinema"]')).toBeDisabled();
  const casting=page.getByRole("radio",{name:"캐스팅 (이전 서식)"});
  await expect(casting).toBeEnabled();
  await casting.check();
  await expect(casting).toBeChecked();
  await expect(page.getByRole("button",{name:"프로필 수정",exact:true})).toBeEnabled();
});
