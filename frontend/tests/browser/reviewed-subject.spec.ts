import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
const auditionId = "22222222-2222-4222-8222-222222222222";
const year = Number(new Intl.DateTimeFormat("en", {timeZone:"Asia/Seoul",year:"numeric"}).format(new Date()));
async function login(context: BrowserContext) {
  const id="11111111-1111-4111-8111-111111111111",exp=Math.floor(Date.now()/1000)+3600;
  const token=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url")+"."+Buffer.from(JSON.stringify({sub:id,exp,aud:"authenticated",role:"authenticated"})).toString("base64url")+".local";
  await context.addCookies([{name:"sb-127-auth-token",value:"base64-"+Buffer.from(JSON.stringify({access_token:token,refresh_token:"local",token_type:"bearer",expires_in:3600,expires_at:exp,user:{id,email:"local@example.invalid",aud:"authenticated",app_metadata:{},user_metadata:{}}})).toString("base64url"),domain:"127.0.0.1",path:"/"}]);
}
test.afterEach(async ({request})=>{await request.post("http://127.0.0.1:15439/__qa/scenario");});
test("실제 API: 배역·나이 검증, 저장본 제목·테스트 접두사·동의 metadata 일치", async ({context,request})=>{
  await login(context);
  await request.post("http://127.0.0.1:15439/__qa/scenario?name=subject");
  const check=await context.request.get(`/api/apply/check?auditionId=${auditionId}`);
  expect((await check.json()).readiness.subjectRules).toEqual({format:"role_name_age_phone_v1",roles:["지안","민수"]});
  expect(await check.text()).not.toContain("fingerprint");
  const base={auditionId,expectedProfileVersion:1,materialIds:[]};
  for(const input of [{role:"허용 안 됨",declaredAge:year-2000},{role:"지안",declaredAge:18},{role:"지안",declaredAge:year-2002},{role:"지안",declaredAge:year-2000,subject:"Bcc: arbitrary"}]) {
    const res=await context.request.post("/api/apply/prepare",{data:{...base,...input}});
    expect(res.status()).toBe(400);
  }
  expect((await (await request.get("http://127.0.0.1:15439/__qa/state")).json()).snapshot).toBeUndefined();
  const prepared=await context.request.post("/api/apply/prepare",{data:{...base,role:"지안",declaredAge:year-2000}});
  expect(prepared.status()).toBe(200);
  const body=await prepared.json();
  expect(body.subject).toBe(`[TEST] [지안] 이전 지원자 / ${year-2000} / 01012345678`);
  expect(body.wordingVersion).toBe("application-sharing-subject-v2");
  expect(body.subjectYear).toBe(year);
  expect(body).not.toHaveProperty("fingerprint");
  const stored=await (await request.get("http://127.0.0.1:15439/__qa/state")).json();
  expect(stored.subject).toBe(body.subject);
  expect(stored.snapshot.subject).toBe(body.subject);
  expect(stored.snapshot.role).toBe(body.role);
  expect(stored.snapshot.declaredAge).toBe(body.declaredAge);
  expect(stored.claimCalls).toBe(0);
});
test("실제 apply: 예약 후 규격 변경은 pending 성공 대신 409 수동 확인",async ({context,request})=>{
  await login(context);
  await request.post("http://127.0.0.1:15439/__qa/scenario?name=dispatch-expired");
  const res=await context.request.post("/api/apply",{data:{preparationId:"55555555-5555-4555-8555-555555555555",consent:true}});
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe("MANUAL_REVIEW");
  expect(await res.text()).not.toContain('"pending":true');
  expect((await (await request.get("http://127.0.0.1:15439/__qa/state")).json()).claimCalls).toBe(1);
});
test("모바일: 배역과 만 나이 선택→정확한 제목→수정 시 동의 초기화",async ({context,page})=>{
  await login(context);
  await page.route("https://www.googletagmanager.com/**",r=>r.abort());
  await page.route(/https:\/\/[^/]*google-analytics\.com\//,r=>r.abort());
  await page.route("**/api/apply/check?*",r=>r.fulfill({json:{hasApplied:false,isSending:false,missingFields:[],readiness:{issues:[],subjectRules:{format:"role_name_age_phone_v1",roles:["지안","민수"]}},profileSummary:{name:"서지안",documentVersion:1,profileVersionId:"44444444-4444-4444-8444-444444444444",birthYear:2000,gender:"여성",genre:["배우"],photoCount:3}}}));
  const pdf=await readFile("../output/pdf/compcards/classic-actor.pdf");
  await page.route("**/api/profile/pdf?*",r=>r.fulfill({body:pdf,contentType:"application/pdf"}));
  await page.route("**/api/apply/prepare",r=>{
    const body=r.request().postDataJSON();
    expect(body.role).toBe("지안");expect(body.declaredAge).toBe(year-2000);
    return r.fulfill({json:{preparationId:"55555555-5555-4555-8555-555555555555",role:body.role,declaredAge:body.declaredAge,recipient:"recipient@example.invalid",replyTo:"local@example.invalid",subject:`[지안] 서지안 / ${year-2000} / 01012345678`,attachments:["profile.pdf"]}});
  });
  let sends=0;
  await page.route("**/api/apply",r=>{sends++;return r.fulfill({status:409,json:{code:"MANUAL_REVIEW",error:"접수 조건 확인이 필요합니다."}});});
  await page.goto(`/audition/${auditionId}`);
  await page.getByRole("button",{name:"지원 준비",exact:true}).click();
  await page.getByRole("button",{name:"제출 PDF 미리보기"}).click();
  const prepare=page.getByRole("button",{name:"수신처와 첨부파일 확인하기"});
  await expect(prepare).toBeDisabled();
  await page.getByLabel("지원 배역",{exact:true}).selectOption("지안");
  await page.getByLabel("현재 만 나이").fill(String(year-2000));
  await expect(prepare).toBeEnabled();await prepare.click();
  await expect(page.getByText(`메일 제목: [지안] 서지안 / ${year-2000} / 01012345678`)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveAccessibleName(new RegExp(`지원 배역 ‘지안’과 본인이 확인한 만 ${year-2000}세`));
  await page.getByRole("checkbox").check();
  await page.getByLabel("지원 배역",{exact:true}).selectOption("민수");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  expect(sends).toBe(0);
  await page.getByLabel("지원 배역",{exact:true}).selectOption("지안");
  await prepare.click();await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"이 내용으로 지원 보내기"}).click();
  await expect(page.getByRole("link",{name:"지원 내역에서 결과 확인하기"})).toBeVisible();
  await expect(page.getByLabel("지원 배역",{exact:true})).toBeDisabled();
  expect(sends).toBe(1);
  await page.screenshot({path:"../output/reviewed-subject-20260924/mobile-subject.png",fullPage:true});
});
