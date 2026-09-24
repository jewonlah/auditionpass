import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import { profileReadiness, requirementReadiness, type ReadinessIssue, type ReviewedRequirements } from "./readiness";
import { z } from "zod";
import { subjectRulesSchema } from "./subject";
const gateSchema = z.object({ ready: z.boolean(), code: z.string(), fingerprint: z.string().optional(),
  subjectRules: subjectRulesSchema.optional(),
  requirements: z.object({ minAge: z.number().nullable(), maxAge: z.number().nullable(), minorRole: z.boolean(), requiredMaterials: z.array(z.string()) }).optional() });
export async function getApplicationReadiness(db: SupabaseClient, auditionId: string, profile: Profile | null) {
  const { data, error } = await db.rpc("private_application_audition_gate", { p_id: auditionId });
  const parsed = gateSchema.safeParse(data);
  const issues: ReadinessIssue[] = profileReadiness(profile);
  if (error || !parsed.success || (parsed.data.ready && (!parsed.data.subjectRules || !parsed.data.fingerprint))) return { issues: [...issues, { code: "READINESS_UNAVAILABLE", message: "지원 조건을 불러오지 못했어요. 잠시 후 다시 확인해주세요.", target: "source" as const }], fingerprint: null, subjectRules: null };
  const gate = parsed.data;
  if (!gate.ready) issues.push({ code: gate.code, message: gate.code === "NOT_ACTIVE" ? "마감되었거나 지원이 중지된 공고입니다." : "접수 조건 확인이 필요해요. 원문 접수 방법을 이용해주세요.", target: "source" });
  if (gate.requirements) {
    const r: ReviewedRequirements = { ...gate.requirements, minAge: gate.requirements.minAge ?? undefined, maxAge: gate.requirements.maxAge ?? undefined };
    // Structured required files are routed to the original application until role-verified material selection ships.
    issues.push(...requirementReadiness(profile, r));
  }
  return { issues, fingerprint: gate.fingerprint ?? null, subjectRules: gate.subjectRules ?? null };
}
