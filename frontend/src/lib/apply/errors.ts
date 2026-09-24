export const CLAIM_ERRORS: Record<string, string> = {
  ACCOUNT_DELETING: "탈퇴 처리 중에는 지원할 수 없어요.",
  PREPARATION_EXPIRED: "제출 준비가 만료됐어요. 자료를 다시 확인해주세요.",
  FILE_OPERATION_PENDING: "사진·PDF 처리가 끝나지 않았어요. 잠시 후 다시 시도하거나 support@auditionpass.co.kr로 문의해주세요.",
  AUDITION_CHANGED: "접수 조건이 바뀌었어요. 공고를 다시 확인해주세요.",
  PROFILE_CHANGED: "프로필이 바뀌었어요. 창을 닫고 지원 준비를 다시 열어주세요.",
  MATERIAL_CHANGED: "첨부 자료가 바뀌었어요. 제출 자료를 다시 선택해주세요.",
  APPLY_IN_PROGRESS: "이전 발송 결과를 확인 중이에요. 지원 내역을 확인해주세요.",
  ALREADY_APPLIED: "기존 지원 기록이 있어요. 지원 내역을 확인해주세요.",
  SEND_STOPPED: "이 지원의 추가 발송이 중지됐어요. 지원 내역을 확인해주세요.",
};
export function claimFailure(message = "") {
  const code = Object.keys(CLAIM_ERRORS).find(code => message.includes(code)) ?? "PREPARATION_CHANGED";
  return { code, error: CLAIM_ERRORS[code] ?? "제출 정보를 다시 확인해주세요." };
}
