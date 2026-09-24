import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import { profileReadiness, requirementReadiness, type ReadinessIssue } from "./readiness";
import { z } from "zod";
import { subjectRulesSchema } from "./subject";
import { requirementsSchema } from "./requirements";
export const gateSchema = z.discriminatedUnion("ready", [
  z.object({ ready: z.literal(false), code: z.string() }),
  z.object({ ready: z.literal(true), code: z.literal("READY"), fingerprint: z.string().min(1), subjectRules: subjectRulesSchema, requirements: requirementsSchema }),
]);
export async function getApplicationReadiness(db: SupabaseClient, auditionId: string, profile: Profile | null) {
  const { data, error } = await db.rpc("private_application_audition_gate", { p_id: auditionId });
  const parsed = gateSchema.safeParse(data);
  const issues: ReadinessIssue[] = profileReadiness(profile);
  if (error || !parsed.success) return { issues: [...issues, { code: "READINESS_UNAVAILABLE", message: "지원 조건을 불러오지 못했어요. 잠시 후 다시 확인해주세요.", target: "source" as const }], fingerprint: null, subjectRules: null, requirements: null };
  const gate = parsed.data;
  if (!gate.ready) {
    issues.push({ code: gate.code, message: gate.code === "NOT_ACTIVE" ? "마감되었거나 지원이 중지된 공고입니다." : "접수 조건 확인이 필요해요. 원문 접수 방법을 이용해주세요.", target: "source" });
    return { issues, fingerprint: null, subjectRules: null, requirements: null };
  }
  issues.push(...requirementReadiness(profile, { ...gate.requirements, minAge: gate.requirements.minAge ?? undefined, maxAge: gate.requirements.maxAge ?? undefined }));
  return { issues, fingerprint: gate.fingerprint, subjectRules: gate.subjectRules, requirements: gate.requirements };
}
