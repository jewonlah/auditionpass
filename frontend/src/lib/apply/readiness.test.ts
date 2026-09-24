import test from "node:test";
import assert from "node:assert/strict";
import { profileReadiness, requirementReadiness, validContactPhone } from "./readiness";
import type { Profile } from "@/types";
const now = new Date("2026-09-22T00:00:00Z");
const adult = { name: "가상", birth_year: 1998, gender: "여성", genre: ["배우"], phone: "010-1234-5678", photo_urls: ["owned"] } as Profile;
test("사진·전화번호 누락과 미성년 경계는 서버 판정에 포함된다", () => {
  assert.deepEqual(profileReadiness(adult, now), []);
  assert.ok(profileReadiness({ ...adult, phone: "" }, now).some(i => i.code === "CONTACT_PHONE"));
  assert.ok(profileReadiness({ ...adult, photo_urls: [] }, now).some(i => i.code === "PHOTO_REQUIRED"));
  assert.ok(profileReadiness({ ...adult, birth_year: 2007 }, now).some(i => i.code === "AGE_REVIEW"));
  assert.equal(validContactPhone("call me"), false);
});
test("미검수·아역·경계 연령·필수 영상은 단순 확인으로 통과하지 않는다", () => {
  assert.equal(requirementReadiness(adult, null, [], now)[0].code, "REQUIREMENTS_UNVERIFIED");
  assert.ok(requirementReadiness(adult, { minorRole: true, maxAge: 13, requiredMaterials: [] }, [], now).some(i => i.code === "ROLE_AGE"));
  assert.equal(requirementReadiness(adult, { minorRole: false, minAge: 28, requiredMaterials: [] }, [], now)[0].code, "ROLE_AGE");
  assert.equal(requirementReadiness(adult, { minorRole: false, requiredMaterials: ["연기 영상"] }, [], now)[0].code, "REQUIRED_MATERIAL");
  assert.deepEqual(requirementReadiness(adult, { minorRole: false, minAge: 20, maxAge: 30, requiredMaterials: [] }, [], now), []);
});
