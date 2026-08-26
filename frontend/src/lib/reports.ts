// 신고 사유 10종과 사유별 등급·SLA (플랜 36 §4). 유저 화면·API·어드민이 같은 정의를 쓴다.
// 심각 4종은 접수 즉시 자동 조치(원클릭 차단 + 검수 강등, 비신뢰 출처면 비활성).

export type ReportSeverity = "severe" | "normal" | "takedown";
export type ReportStatus = "received" | "actioned" | "dismissed";

export interface ReportReason {
  code: string;
  label: string;
  hint: string;
  severity: ReportSeverity;
}

export const REPORT_REASONS: ReportReason[] = [
  {
    code: "fee_demand",
    label: "돈을 요구해요",
    hint: "참가비·교육비·프로필 촬영비·선입금 등",
    severity: "severe",
  },
  {
    code: "identity_demand",
    label: "신분증·계좌를 요구해요",
    hint: "주민번호·신분증 사본·통장 사본 등",
    severity: "severe",
  },
  {
    code: "adult_coercion",
    label: "노출·성적인 요구가 있어요",
    hint: "사전 고지 없는 노출 촬영 요구 등",
    severity: "severe",
  },
  {
    code: "scam",
    label: "사기가 의심돼요",
    hint: "연락처가 가짜거나 다른 목적으로 유인",
    severity: "severe",
  },
  {
    code: "expired",
    label: "이미 마감된 공고예요",
    hint: "",
    severity: "normal",
  },
  {
    code: "wrong_info",
    label: "정보가 사실과 달라요",
    hint: "마감일·조건·지원 방법 오류",
    severity: "normal",
  },
  {
    code: "duplicate",
    label: "같은 공고가 중복으로 있어요",
    hint: "",
    severity: "normal",
  },
  {
    code: "unreachable",
    label: "지원해도 연락이 닿지 않아요",
    hint: "메일 반송·수신 거부 등",
    severity: "normal",
  },
  {
    code: "spam",
    label: "오디션이 아닌 광고예요",
    hint: "홍보·체험단·판매 글",
    severity: "normal",
  },
  {
    code: "takedown",
    label: "게시 중단을 요청합니다",
    hint: "공고 게시자·권리자의 삭제 요청",
    severity: "takedown",
  },
];

export const REASON_MAP = new Map(REPORT_REASONS.map((r) => [r.code, r]));

// SLA: 심각 24h / 일반 3일 / 삭제 요청 48h (36 §4)
const SLA_HOURS: Record<ReportSeverity, number> = {
  severe: 24,
  takedown: 48,
  normal: 72,
};

export function slaHours(severity: ReportSeverity): number {
  return SLA_HOURS[severity];
}

export const SEVERITY_LABEL: Record<ReportSeverity, string> = {
  severe: "심각",
  normal: "일반",
  takedown: "삭제 요청",
};

// 유저에게 노출되는 3상태 (내부 처리 상태를 그대로 보여주지 않는다)
export const STATUS_LABEL: Record<ReportStatus, string> = {
  received: "접수됨",
  actioned: "조치됨",
  dismissed: "유지됨",
};
