import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgementsMatch, requirementsSchema } from "./requirements";
import { gateSchema } from "./gate";
import { requirementReadiness } from "./readiness";
import type { Profile } from "@/types";
const requirements = { minAge: 30, maxAge: 50, minorRole: false, requiredMaterials: [], requiredGender: "남성" as const, requireCareer: true, acknowledgements: ["10/1 도착", "10/2~5 참석"], ageScope: "pilot" as const };
const profile = { birth_year: 1985, gender: "남성", career: "가상 경력" } as Profile;
const now = new Date("2026-09-25T00:00:00Z");
test("필수 이력 및 배역 성별은 저장 프로필로 판정한다", () => {
  assert.deepEqual(requirementReadiness(profile, requirements, [], now), []);
  for (const career of [null, "", " \n\t "]) assert.ok(requirementReadiness({ ...profile, career }, requirements, [], now).some(v => v.code === "CAREER_REQUIRED"));
  for (const gender of ["여성", "기타", undefined]) assert.ok(requirementReadiness({ ...profile, gender } as Profile, requirements, [], now).some(v => v.code === "ROLE_GENDER"));
});
test("필수 확인은 누락/추가/중복/순서 변경을 거절한다", () => {
  const expected = requirements.acknowledgements;
  assert.equal(acknowledgementsMatch(expected, [...expected]), true);
  for (const accepted of [[], [expected[0]], [...expected, "extra"], [...expected].reverse(), [expected[0], expected[0]]]) assert.equal(acknowledgementsMatch(expected, accepted), false);
});
test("비등록 공고는 정상 거절하며 구 READY 계약은 허용하지 않는다", () => {
  assert.equal(gateSchema.safeParse({ ready: false, code: "REQUIREMENTS_UNVERIFIED" }).success, true);
  const gate = { ready: true, code: "READY", fingerprint: "fp", subjectRules: { format: "standard", roles: [] }, requirements };
  assert.equal(gateSchema.safeParse(gate).success, true);
  assert.equal(gateSchema.safeParse({ ...gate, requirements: undefined }).success, false);
  for (const field of ["requiredGender", "requireCareer", "acknowledgements", "ageScope"]) assert.equal(requirementsSchema.safeParse({ ...requirements, [field]: undefined }).success, false);
});
test("파일럿 연령 제한은 원문 모집 자격 탈락처럼 안내하지 않는다", () => {
  const issues = requirementReadiness({ ...profile, birth_year: 2000 }, requirements, [], now);
  assert.match(issues.find(v => v.code === "ROLE_AGE")!.message, /원클릭 제공 연령/);
});
