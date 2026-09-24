import { z } from "zod";
import type { Profile } from "@/types";

const roleSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣ ._-]+$/)
  .refine(value => value.trim() === value);
export const subjectRulesSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal("standard"), roles: z.array(roleSchema).length(0) }),
  z.object({ format: z.literal("role_name_age_phone_v1"), roles: z.array(roleSchema).min(1).max(20)
    .refine(values => new Set(values).size === values.length) }),
]);
export type SubjectRules = z.infer<typeof subjectRulesSchema>;
export const subjectInputSchema = z.object({ role: roleSchema.optional(), declaredAge: z.number().int().min(19).max(120).optional() });
export function subjectYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(now));
}
const unsafe = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\[\]\/]/u;
type SubjectResult = { ok: false; error: string } | { ok: true; subject?: string; metadata: {
  wordingVersion: "application-sharing-v1" | "application-sharing-subject-v2";
  role?: string; declaredAge?: number; subjectYear?: number;
} };
export function prepareReviewedSubject(rules: SubjectRules, profile: Pick<Profile, "name" | "phone" | "birth_year">,
  input: z.infer<typeof subjectInputSchema>, now = new Date()): SubjectResult {
  if (!subjectRulesSchema.safeParse(rules).success) return { ok: false, error: "공고의 제목 규격을 다시 확인해주세요." };
  if (rules.format === "standard") {
    if (input.role !== undefined || input.declaredAge !== undefined) return { ok: false, error: "이 공고는 배역 제목을 사용하지 않아요. 지원 조건을 다시 확인해주세요." };
    return { ok: true, metadata: { wordingVersion: "application-sharing-v1" } };
  }
  if (!input.role || !rules.roles.includes(input.role)) return { ok: false, error: "지원할 배역을 선택해주세요." };
  const age = input.declaredAge;
  const year = subjectYear(now);
  if (typeof age !== "number" || !Number.isInteger(age) || age < 19 || age > 120
    || typeof profile.birth_year !== "number" || !Number.isInteger(profile.birth_year)
    || age < year - profile.birth_year - 1 || age > year - profile.birth_year) {
    return { ok: false, error: "저장한 출생연도와 맞는 만 나이를 입력해주세요. 생일이 지났는지도 확인해주세요." };
  }
  // Validate original saved values before trimming or normalization.
  if (!profile.name || profile.name.length > 80 || unsafe.test(profile.name) || !profile.name.trim()) {
    return { ok: false, error: "제목에 쓸 이름을 확인해주세요. 프로필에서 줄바꿈과 특수 구분자를 지운 뒤 저장해주세요." };
  }
  if (!profile.phone || unsafe.test(profile.phone) || !/^[0-9 ()-]+$/.test(profile.phone)) {
    return { ok: false, error: "프로필 연락처를 숫자와 하이픈으로 입력한 뒤 저장해주세요." };
  }
  const phone = profile.phone.replace(/[ ()-]/g, "");
  if (!/^0\d{8,10}$/.test(phone)) return { ok: false, error: "프로필의 연락처를 다시 확인해주세요." };
  return { ok: true, subject: `[${input.role}] ${profile.name.trim()} / ${age} / ${phone}`,
    metadata: { wordingVersion: "application-sharing-subject-v2", role: input.role, declaredAge: age, subjectYear: year } };
}
