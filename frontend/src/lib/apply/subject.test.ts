import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareReviewedSubject, subjectRulesSchema, subjectYear, type SubjectRules } from "./subject";
const rules: SubjectRules = { format: "role_name_age_phone_v1", roles: ["지안", "성인 배우-1"] };
const profile = { name: "김배우", phone: "010-1234-5678", birth_year: 2000 };
const now = new Date("2026-09-24T00:00:00Z");
test("reviewed subject: explicit birthday before/after, immutable metadata", () => {
  for (const declaredAge of [25, 26]) assert.deepEqual(prepareReviewedSubject(rules, profile, { role: "지안", declaredAge }, now), {
    ok: true, subject: `[지안] 김배우 / ${declaredAge} / 01012345678`, metadata: { wordingVersion: "application-sharing-subject-v2", role: "지안", declaredAge, subjectYear: 2026 },
  });
  for (const declaredAge of [undefined, 24, 27, 25.5, 18, 121]) assert.equal(prepareReviewedSubject(rules, profile, { role: "지안", declaredAge }, now).ok, false);
  assert.equal(prepareReviewedSubject(rules, { ...profile, birth_year: null }, { role: "지안", declaredAge: 25 }, now).ok, false);
});
test("reviewed subject: role allowlist and single-line original saved profile", () => {
  for (const role of [undefined, "다른 배역", "지안\r\nBcc: x"]) assert.equal(prepareReviewedSubject(rules, profile, { role, declaredAge: 25 }, now).ok, false);
  for (const name of ["김\n배우", "김\u202e배우", "김/배우", "[김]", "가".repeat(81), "   "])
    assert.equal(prepareReviewedSubject(rules, { ...profile, name }, { role: "지안", declaredAge: 25 }, now).ok, false);
  for (const phone of ["010\n12345678", "010\u200b12345678", "010１２３４５６７８", "123", null])
    assert.equal(prepareReviewedSubject(rules, { ...profile, phone }, { role: "지안", declaredAge: 25 }, now).ok, false);
});
test("reviewed subject: standard cannot smuggle custom inputs or unknown formats", () => {
  assert.deepEqual(prepareReviewedSubject({ format: "standard", roles: [] }, profile, {}, now), { ok: true, metadata: { wordingVersion: "application-sharing-v1" } });
  assert.equal(prepareReviewedSubject({ format: "standard", roles: [] }, profile, { role: "지안" }, now).ok, false);
  for (const candidate of [{ format: "unknown", roles: [] }, { format: "standard", roles: ["A"] }, ...[[], ["A", "A"], [null], [" A"], ["A\t"], ["A/B"], ["A\u202e"], Array.from({length: 21}, (_,i) => `${i}`)].map(roles => ({ format: "role_name_age_phone_v1", roles }))])
    assert.equal(subjectRulesSchema.safeParse(candidate).success, false);
});
test("subject year uses Korea even when UTC year has not changed", () => {
  assert.equal(subjectYear(new Date("2026-12-31T14:59:59Z")), 2026);
  assert.equal(subjectYear(new Date("2026-12-31T15:00:00Z")), 2027);
  assert.equal(prepareReviewedSubject(rules, profile, { role: "지안", declaredAge: 25 }, new Date("2026-12-31T15:00:00Z")).ok, false);
});
