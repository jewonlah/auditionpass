import test from "node:test";
import assert from "node:assert/strict";
import { deliverJob, type DeliveryJob } from "./delivery";

const now = Date.parse("2026-09-10T01:00:00Z");
const job: DeliveryJob = { id: "key1", application_id: "app1", provider_id: null, mode: "test", created_at: new Date(now - 60_000).toISOString(), payload: { from: "sender@test.com", to: "target@test.com", subject: "test", html: "snapshot" } };
test("DB 저장 실패 후 동일 본문·키로 복구한다", async () => {
  const jobWithPdf = { ...job, payload: { ...job.payload!, attachments: [{ filename: "profile.pdf", content: "fixed-base64-pdf" }] } };
  const requests: string[] = [];
  const send = async (payload: unknown, key: string) => { requests.push(JSON.stringify({ payload, key })); return "mail1"; };
  assert.equal(await deliverJob(jobWithPdf, { now, send, recordProvider: async () => { throw Error("db offline"); }, complete: async () => {} }), "pending");
  assert.equal(await deliverJob(jobWithPdf, { now, send, recordProvider: async () => {}, complete: async () => {} }), "sent");
  assert.equal(requests[0], requests[1]);
});
test("23시간이 지난 불확실한 발송은 재전송하지 않는다", async () => {
  let sent = false;
  assert.equal(await deliverJob(job, { now: now + 24 * 3600_000, send: async () => { sent = true; return "bad"; }, recordProvider: async () => {}, complete: async () => {} }), "expired");
  assert.equal(sent, false);
});
test("발송 영수증이 있으면 재전송 없이 상태만 복구한다", async () => {
  let completed = false;
  assert.equal(await deliverJob({ ...job, provider_id: "mail1", payload: null }, { now: now + 48 * 3600_000, send: async () => { throw Error("must not send"); }, recordProvider: async () => {}, complete: async () => { completed = true; } }), "sent");
  assert.equal(completed, true);
});
