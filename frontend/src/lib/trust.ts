// 신뢰 배지 3단계 (플랜 36 §4). "검증됨" 같은 보증 표현은 금지(36 §3) —
// 검수 완료에는 "안전 보장 아님" 고지를 반드시 함께 노출한다.
//
// 판정 근거는 공고 행만으로 계산한다:
//   review_status='approved' = 운영자가 직접 확인한 공고
//   review_status='auto'     = 신뢰 출처에서 자동 게재된 공고 (크롤러가 trusted_sources 확인 후 부여)
//   reports_count            = 반려되지 않은 신고 수 (015에서 비정규화)

export type TrustLevel = "reviewed" | "source_verified" | "caution";

export interface TrustBadge {
  level: TrustLevel;
  label: string;
  hint: string;
}

// 출처 확인 배지의 최소 관찰 기간 (36 §4: trusted + 7일 + 무신고)
const SOURCE_VERIFIED_MIN_DAYS = 7;

export interface TrustInput {
  review_status?: string | null;
  created_at: string;
  reports_count?: number | null;
  oneclick_blocked?: boolean | null;
  apply_email: string | null;
  source_url: string | null;
}

export function getTrustBadge(audition: TrustInput): TrustBadge {
  const reports = audition.reports_count ?? 0;

  if (reports > 0 || audition.oneclick_blocked) {
    return {
      level: "caution",
      label: "주의 필요",
      hint: "신고가 접수되어 확인 중인 공고입니다. 지원 전 원문을 직접 확인해 주세요.",
    };
  }

  if (!audition.apply_email && !audition.source_url) {
    return {
      level: "caution",
      label: "주의 필요",
      hint: "지원처를 확인할 수 없는 공고입니다.",
    };
  }

  if (audition.review_status === "approved") {
    return {
      level: "reviewed",
      label: "검수 완료",
      hint: "운영자가 공고 내용을 확인했습니다. 안전을 보장하지는 않습니다.",
    };
  }

  const ageDays = (Date.now() - new Date(audition.created_at).getTime()) / 86400000;
  if (audition.review_status === "auto" && ageDays >= SOURCE_VERIFIED_MIN_DAYS) {
    return {
      level: "source_verified",
      label: "출처 확인",
      hint: "확인된 출처에서 7일 이상 신고 없이 유지된 공고입니다. 안전을 보장하지는 않습니다.",
    };
  }

  return {
    level: "caution",
    label: "주의 필요",
    hint: "수집된 지 얼마 되지 않아 아직 확인 중인 공고입니다. 원문을 함께 확인해 주세요.",
  };
}
