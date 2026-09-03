// 지원 발송 상태 전이 회귀 테스트 (node --test, 의존성 없음)
// 고정 대상:
//  - 발송 실패 이력이 유실되던 결함(applications 행 미생성)
//  - 동시 요청 중복 발송(Codex 교차 리뷰 #2) — 선점 전이 규칙
//  - 테스트 환경 발송 생략을 성공으로 기록하던 결함(#3)

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildApplicationRow,
  buildReservationRow,
  decideReservation,
  sendFailureResponse,
  emailSkippedResponse,
  isSkippedSend,
} from "./status";

test("발송 성공 시 email_sent:true, sent_at 채움, status:'sent'", () => {
  const now = new Date("2026-09-03T10:00:00+09:00");
  const row = buildApplicationRow({
    userId: "u1",
    auditionId: "a1",
    outcome: "sent",
    now,
  });
  assert.equal(row.email_sent, true);
  assert.equal(row.sent_at, now.toISOString());
  assert.equal(row.status, "sent");
  assert.equal(row.user_id, "u1");
  assert.equal(row.audition_id, "a1");
});

test("발송 실패 시 email_sent:false, sent_at:null, status:'failed'", () => {
  const row = buildApplicationRow({
    userId: "u1",
    auditionId: "a1",
    outcome: "failed",
  });
  assert.equal(row.email_sent, false);
  assert.equal(row.sent_at, null);
  assert.equal(row.status, "failed");
});

test("now 미지정 시에도 sent 행은 유효한 ISO 타임스탬프를 갖는다", () => {
  const row = buildApplicationRow({ userId: "u1", auditionId: "a1", outcome: "sent" });
  assert.ok(row.sent_at && !Number.isNaN(new Date(row.sent_at).getTime()));
});

test("발송 실패 응답은 502 + SEND_FAILED 코드 + 한국어 메시지", () => {
  const res = sendFailureResponse();
  assert.equal(res.status, 502);
  assert.equal(res.body.code, "SEND_FAILED");
  assert.match(res.body.error, /[가-힣]/);
});

/* ─── 선점(sending) 전이 ─── */

test("선점 행은 status:'sending' 이고 발송 흔적이 비어 있다", () => {
  const row = buildReservationRow({ userId: "u1", auditionId: "a1" });
  assert.equal(row.status, "sending");
  assert.equal(row.email_sent, false);
  assert.equal(row.sent_at, null);
  assert.equal(row.user_id, "u1");
  assert.equal(row.audition_id, "a1");
});

test("이력이 없으면 새로 선점한다", () => {
  assert.equal(decideReservation(null).action, "insert");
  assert.equal(decideReservation(undefined).action, "insert");
});

test("발송 실패 이력은 재시도를 허용한다 (resume)", () => {
  assert.equal(decideReservation({ status: "failed" }).action, "resume");
});

test("발송 중(sending)이면 409 APPLY_IN_PROGRESS — 두 탭 동시 지원 차단", () => {
  const d = decideReservation({ status: "sending" });
  assert.equal(d.action, "reject");
  assert.ok(d.action === "reject");
  assert.equal(d.response.status, 409);
  assert.equal(d.response.body.code, "APPLY_IN_PROGRESS");
  assert.match(d.response.body.error, /[가-힣]/);
});

test("이미 지원(sent/replied)이면 409 ALREADY_APPLIED", () => {
  for (const status of ["sent", "replied"]) {
    const d = decideReservation({ status });
    assert.ok(d.action === "reject", `${status} 는 거절돼야 한다`);
    assert.equal(d.response.status, 409);
    assert.equal(d.response.body.code, "ALREADY_APPLIED");
  }
});

test("알 수 없는 status 는 안전하게 '이미 지원'으로 막는다", () => {
  const d = decideReservation({ status: "무언가" });
  assert.ok(d.action === "reject");
  assert.equal(d.response.body.code, "ALREADY_APPLIED");
});

/* ─── 발송 생략 ─── */

test("발송 생략은 성공이 아니다 — 502 + EMAIL_SKIPPED + 한국어 안내", () => {
  const res = emailSkippedResponse();
  assert.equal(res.status, 502);
  assert.notEqual(res.status, 202);
  assert.equal(res.body.code, "EMAIL_SKIPPED");
  assert.match(res.body.error, /테스트 환경/);
  assert.match(res.body.error, /발송되지 않/);
});

test("isSkippedSend 는 {skipped:true} 만 참으로 본다", () => {
  assert.equal(isSkippedSend({ skipped: true }), true);
  assert.equal(isSkippedSend({ skipped: false }), false);
  assert.equal(isSkippedSend({ id: "resend-id" }), false);
  assert.equal(isSkippedSend(null), false);
  assert.equal(isSkippedSend(undefined), false);
});
