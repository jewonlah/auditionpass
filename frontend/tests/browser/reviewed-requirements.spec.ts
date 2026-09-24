import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
const auditionId="22222222-2222-4222-8222-222222222222";
const acks=["10/1 도착","10/2~5 참석"];
async function login(context: BrowserContext) {
 const id="11111111-1111-4111-8111-111111111111", exp=Math.floor(Date.now()/1000)+3600;
 const token=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url")+"."+Buffer.from(JSON.stringify({sub:id,exp,aud:"authenticated",role:"authenticated"})).toString("base64url")+".local";
 await context.addCookies([{name:"sb-127-auth-token",value:"base64-"+Buffer.from(JSON.stringify({access_token:token,refresh_token:"local",token_type:"bearer",expires_in:3600,expires_at:exp,user:{id,email:"local@example.invalid",aud:"authenticated",app_metadata:{},user_metadata:{}}})).toString("base64url"),domain:"127.0.0.1",path:"/"}]);
}
test.afterEach(async ({request})=>{await request.post("http://127.0.0.1:15439/__qa/scenario");});
test("API는 저장본의 성별·이력과 필수 확인을 검사한다",async({context,request})=>{
 await login(context);
 const data={auditionId,expectedProfileVersion:1,materialIds:[],acceptedAcknowledgements:acks};
 for(const [scenario,code] of [["requirements-career","CAREER_REQUIRED"],["requirements-gender","ROLE_GENDER"]]) {
  await request.post(`http://127.0.0.1:15439/__qa/scenario?name=${scenario}`);
  const res=await context.request.post("/api/apply/prepare",{data});
  expect(res.status()).toBe(409);expect((await res.json()).code).toBe(code);
  expect((await (await request.get("http://127.0.0.1:15439/__qa/state")).json()).snapshot).toBeUndefined();
 }
 await request.post("http://127.0.0.1:15439/__qa/scenario?name=requirements");
 const missing=await context.request.post("/api/apply/prepare",{data:{...data,acceptedAcknowledgements:[]}});
 expect(missing.status()).toBe(409);expect((await missing.json()).code).toBe("ACKNOWLEDGEMENTS_REQUIRED");
 const good=await context.request.post("/api/apply/prepare",{data});expect(good.status()).toBe(200);
 const body=await good.json();expect(body.acceptedAcknowledgements).toEqual(acks);expect(body.requirementsVersion).toBe(1);
 const stored=await (await request.get("http://127.0.0.1:15439/__qa/state")).json();
 expect(stored.snapshot.acceptedAcknowledgements).toEqual(acks);expect(stored.snapshot.requirementsVersion).toBe(1);expect(stored.claimCalls).toBe(0);
});
test("모바일 필수 일정 체크와 변경 후 동의 초기화",async({context,page})=>{
 await login(context);
 await page.route("https://www.googletagmanager.com/**",r=>r.abort());
 await page.route(/https:\/\/[^/]*google-analytics\.com\//,r=>r.abort());
 await page.route("**/api/apply/check?*",r=>r.fulfill({json:{hasApplied:false,isSending:false,missingFields:[],readiness:{issues:[],subjectRules:{format:"standard",roles:[]},requirements:{minAge:40,maxAge:49,minorRole:false,requiredMaterials:[],requiredGender:"남성",requireCareer:true,acknowledgements:acks,ageScope:"pilot"}},profileSummary:{name:"가상 배우",documentVersion:1,profileVersionId:"44444444-4444-4444-8444-444444444444",birthYear:1985,gender:"남성",genre:["배우"],photoCount:1}}}));
 const pdf=await readFile("../output/pdf/compcards/classic-actor.pdf");
 await page.route("**/api/profile/pdf?*",r=>r.fulfill({body:pdf,contentType:"application/pdf"}));
 let preparations=0;
 await page.route("**/api/apply/prepare",r=>{expect(r.request().postDataJSON().acceptedAcknowledgements).toEqual(acks);preparations++;return r.fulfill({json:{preparationId:"55555555-5555-4555-8555-555555555555",subject:"[TEST] 가상 지원",recipient:"local@example.invalid",replyTo:"local@example.invalid",attachments:["profile.pdf"],acceptedAcknowledgements:acks,requirementsVersion:1}});});
 await page.goto(`/audition/${auditionId}`);await page.getByRole("button",{name:"지원 준비",exact:true}).click();
 await page.getByRole("button",{name:"제출 PDF 미리보기"}).click();
 const prepare=page.getByRole("button",{name:"수신처와 첨부파일 확인하기"});
 await expect(prepare).toBeDisabled();await page.getByLabel(acks[0],{exact:true}).check();await expect(prepare).toBeDisabled();
 await page.getByLabel(acks[1],{exact:true}).check();await prepare.click();
 await expect(page.getByText(`확인한 조건: ${acks[0]}`)).toBeVisible();
 const consent=page.getByRole("checkbox",{name:/접수처로 프로필의/});await consent.check();
 await page.getByLabel(acks[0],{exact:true}).uncheck();await expect(consent).not.toBeChecked();await expect(consent).toBeDisabled();await expect(prepare).toBeDisabled();
 await expect(page.getByText(/배역 적합성을 보장하지/)).toBeVisible();expect(preparations).toBe(1);
});
