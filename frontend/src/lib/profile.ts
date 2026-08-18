import type { Profile } from "@/types";

export type MiniProfileField = "name" | "birth_year" | "gender" | "genre";

/** 분야 14개 카테고리 (007_category_system — '기타' 제외) */
export const PROFILE_GENRES = [
  "배우",
  "모델",
  "아이돌",
  "키즈모델",
  "가수",
  "트로트",
  "촬영모델",
  "뮤지컬",
  "연극",
  "성우",
  "댄서",
  "MC/진행자",
  "엑스트라",
  "인플루언서",
] as const;

export const MINI_PROFILE_LABELS: Record<MiniProfileField, string> = {
  name: "이름",
  birth_year: "출생연도",
  gender: "성별",
  genre: "분야",
};

/** 미니 프로필(지원 최소 요건) 부족 필드 계산 — 12_ia-userflows F5: 이름·출생연도·성별·분야 */
export function getMissingFields(profile: Profile | null): MiniProfileField[] {
  const missing: MiniProfileField[] = [];
  if (!profile?.name) missing.push("name");
  if (!profile?.birth_year && !profile?.age) missing.push("birth_year");
  if (!profile?.gender) missing.push("gender");
  if ((profile?.genre?.length ?? 0) === 0) missing.push("genre");
  return missing;
}
