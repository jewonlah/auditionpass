// 지원 발송 상태 전이 (순수 함수 — 부작용 없음)
//
// 왜 필요한가:
// 1) 메일 발송이 실패해도 지원 이력 자체는 남아야 한다. 그래야 /applications(지원 탭)에서
//    "발송 실패" 배지가 뜨고, 재시도로 성공하면 같은 행(user_id, audition_id unique)이
//    'sent'로 갱신된다 — 새 행이 생기지 않는다. (11_prd.md F6)
// 2) 발송 **전에** 'sending'으로 행을 선점해 동시 요청 중 하나만 통과시킨다.
//    (Codex 교차 리뷰 2026-09-03 결함 #2 — 두 탭 동시 지원 시 메일 2통 발송)
//
// ⚠️ 'sending' 은 023_applications_sending_status 마이그레이션이 적용돼야 저장된다.
//    미적용 라이브에서는 CHECK 위반(23514)이 나며, 라우트가 선점을 건너뛰고 강등된다.

/** applications.status 전체 도메인 (009a + 023) */
export type ApplyStatus = "sending" | "sent" | "failed" | "replied";

/** 발송 시도의 최종 결과 */
export type ApplyOutcome = "sent" | "failed";

export interface ApplicationUpsertRow {
  user_id: string;
  audition_id: string;
  email_sent: boolean;
  sent_at: string | null;
  status: ApplyOutcome;
}

/** 발송 성공/실패에 따라 applications 갱신 행을 구성한다. */
export function buildApplicationRow(params: {
  userId: string;
  auditionId: string;
  outcome: ApplyOutcome;
  now?: Date;
}): ApplicationUpsertRow {
  const { userId, auditionId, outcome, now = new Date() } = params;
  return {
    user_id: userId,
    audition_id: auditionId,
    email_sent: outcome === "sent",
    sent_at: outcome === "sent" ? now.toISOString() : null,
    status: outcome,
  };
}

export interface ApplicationReservationRow {
  user_id: string;
  audition_id: string;
  email_sent: false;
  sent_at: null;
  status: "sending";
}

/**
 * 발송 전 선점 행. unique(user_id, audition_id) 가 동시 요청을 여기서 잘라낸다.
 * email_sent/sent_at 은 아직 아무것도 나가지 않았으므로 비운다 —
 * 이 값이 채워져 있으면 지원 탭이 "발송 완료"로 오해한다.
 */
export function buildReservationRow(params: {
  userId: string;
  auditionId: string;
}): ApplicationReservationRow {
  return {
    user_id: params.userId,
    audition_id: params.auditionId,
    email_sent: false,
    sent_at: null,
    status: "sending",
  };
}

export interface ApplyErrorResponse {
  status: number;
  body: { error: string; code: string };
}

/**
 * 기존 applications 행을 보고 이번 요청을 어떻게 처리할지 결정한다.
 * - insert: 이력 없음 → 새로 선점
 * - resume: 지난 발송이 실패함 → 같은 행을 'sending'으로 되돌리고 재시도
 * - reject: 이미 지원했거나(sent/replied) 다른 요청이 진행 중(sending)
 */
export type ReservationDecision =
  | { action: "insert" }
  | { action: "resume" }
  | { action: "reject"; response: ApplyErrorResponse };

export function decideReservation(
  existing: { status?: string | null } | null | undefined
): ReservationDecision {
  if (!existing) return { action: "insert" };

  // 발송이 실패한 이력은 "지원함"이 아니다 — 재시도를 막으면 안 된다.
  if (existing.status === "failed") return { action: "resume" };

  // 다른 요청이 이미 발송 중. 같은 사람이 두 탭에서 누른 경우가 대부분이다.
  if (existing.status === "sending") {
    return { action: "reject", response: applyInProgressResponse() };
  }

  // sent · replied · (023 미적용 환경의 알 수 없는 값) → 이미 지원한 것으로 본다.
  return { action: "reject", response: alreadyAppliedResponse() };
}

/** 이미 지원 완료 — ApplyButton 상태머신의 분기 키(이름 고정). */
export function alreadyAppliedResponse(): ApplyErrorResponse {
  return {
    status: 409,
    body: { error: "이미 지원한 오디션입니다.", code: "ALREADY_APPLIED" },
  };
}

/** 동시 요청 차단 — 진행 중이라는 사실만 알리고 재시도를 유도한다. */
export function applyInProgressResponse(): ApplyErrorResponse {
  return {
    status: 409,
    body: {
      error: "이미 지원을 처리하고 있습니다. 잠시 후 지원 내역에서 결과를 확인해주세요.",
      code: "APPLY_IN_PROGRESS",
    },
  };
}

/** 발송 실패 시 사용자에게 보여줄 응답 — 502(외부 메일 발송 실패), 재시도 유도 문구. */
export function sendFailureResponse(): ApplyErrorResponse {
  return {
    status: 502,
    body: {
      error: "메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      code: "SEND_FAILED",
    },
  };
}

/**
 * 비프로덕션 발송 생략(sendApplicationEmail 의 `{skipped:true}`) 응답.
 *
 * 이전에는 생략을 성공으로 취급해 status:'sent'로 저장하고 완료 화면을 띄웠다.
 * 실제로는 아무 메일도 나가지 않았으므로 **성공으로 보이면 안 된다** —
 * 프리뷰에서 지원한 유저가 합격 연락을 기다리는 최악의 오해가 생긴다.
 * 202가 아니라 502로 돌려 UI 상태머신이 완료 분기로 가지 않게 한다.
 * (Codex 교차 리뷰 2026-09-03 결함 #3)
 */
export function emailSkippedResponse(): ApplyErrorResponse {
  return {
    status: 502,
    body: {
      error:
        "테스트 환경이라 발송을 생략했습니다. 실제 지원 메일은 발송되지 않았습니다.",
      code: "EMAIL_SKIPPED",
    },
  };
}

/** sendApplicationEmail 의 반환값이 "발송 생략"인지 판별. */
export function isSkippedSend(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "skipped" in result &&
    (result as { skipped?: unknown }).skipped === true
  );
}
