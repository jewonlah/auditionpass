import { z } from "zod";

export const acknowledgementSchema = z.string().min(1).max(300).refine(v => v.trim() === v);
export const acknowledgementListSchema = z.array(acknowledgementSchema).max(10).refine(v => new Set(v).size === v.length);
export const requirementsSchema = z.object({
  minAge: z.number().int().nullable(), maxAge: z.number().int().nullable(),
  minorRole: z.boolean(), requiredMaterials: z.array(z.string()),
  requiredGender: z.enum(["남성", "여성"]).nullable(), requireCareer: z.boolean(),
  acknowledgements: acknowledgementListSchema, ageScope: z.enum(["source", "pilot"]),
});
export type ApplicationRequirements = z.infer<typeof requirementsSchema>;
export function acknowledgementsMatch(expected: string[], accepted: string[]): boolean {
  return acknowledgementListSchema.safeParse(accepted).success && expected.length === accepted.length && expected.every((v,i) => v === accepted[i]);
}
