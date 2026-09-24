import type { Profile } from "@/types";
import { getMissingFields } from "@/lib/profile";

export type ReadinessIssue = { code: string; message: string; target: "profile" | "source" | "materials" };
export type ReviewedRequirements = { minAge?: number; maxAge?: number; minorRole: boolean; requiredMaterials: string[] };
export function validContactPhone(value?: string | null): boolean {
  return /^0\d{8,10}$/.test((value ?? "").replace(/[\s()-]/g, ""));
}
/** Conservative age interval: a birth year alone does not establish a birthday. */
export function profileReadiness(profile: Profile | null, now = new Date()): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  if (getMissingFields(profile).length) issues.push({ code: "BASIC_INFO", message: "이름·출생연도·성별·분야를 채워주세요.", target: "profile" });
  if (!profile?.photo_urls?.length) issues.push({ code: "PHOTO_REQUIRED", message: "제출할 사진을 1장 이상 추가해주세요.", target: "profile" });
  if (!validContactPhone(profile?.phone)) issues.push({ code: "CONTACT_PHONE", message: "연락받을 전화번호를 확인해주세요.", target: "profile" });
  const year = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(now));
  if (!profile?.birth_year || year - profile.birth_year - 1 < 19) issues.push({ code: "AGE_REVIEW", message: "미성년 또는 연령 확인이 필요한 지원은 원문 접수 방법을 이용해주세요.", target: "source" });
  return issues;
}
export function requirementReadiness(profile: Profile | null, reviewed: ReviewedRequirements | null, materialRoles: string[] = [], now = new Date()): ReadinessIssue[] {
  if (!reviewed) return [{ code: "REQUIREMENTS_UNVERIFIED", message: "접수처와 필수 자료를 확인 중이에요. 원문에서 지원 방법을 확인해주세요.", target: "source" }];
  const issues: ReadinessIssue[] = [];
  if (reviewed.minorRole) issues.push({ code: "MINOR_ROLE", message: "미성년 모집은 보호자 확인이 가능한 원문 접수를 이용해주세요.", target: "source" });
  const year = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" }).format(now));
  const upper = profile?.birth_year ? year - profile.birth_year : null;
  if ((reviewed.minAge != null || reviewed.maxAge != null) && (upper === null ||
    (reviewed.minAge != null && upper - 1 < reviewed.minAge) || (reviewed.maxAge != null && upper > reviewed.maxAge))) {
    issues.push({ code: "ROLE_AGE", message: "모집 연령과 프로필을 확인해주세요. 경계 연령은 원문 확인이 필요해요.", target: "source" });
  }
  for (const role of reviewed.requiredMaterials) if (!materialRoles.includes(role)) issues.push({ code: "REQUIRED_MATERIAL", message: `필수 자료: ${role}`, target: "materials" });
  return issues;
}
