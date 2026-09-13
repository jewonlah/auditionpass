import test from "node:test";
import assert from "node:assert/strict";
import { profileFormSchema, profileWriteSchema, buildPolishRequest } from "./form";
import { parsePolishInput } from "./polish";

const minimum = { name: "지원자", birth_year: "2000", gender: "여성", genre: ["성우"], specialty: [] };
test("미니 프로필만으로 저장하고 비운 키·몸무게는 null로 보낸다", () => {
  const data = profileFormSchema.parse({ ...minimum, height: "", weight: "" });
  assert.equal(data.height, null);
  assert.equal(data.weight, null);
  assert.deepEqual(data.genre, ["성우"]);
  assert.deepEqual(data.activity_field, []);
});
test("HTML 입력에서 만들어진 AI 요청이 API 검증을 통과한다", () => {
  const body = buildPolishRequest({ ...minimum, height: "170", career: "가".repeat(500) });
  assert.equal(body.height, 170);
  assert.equal(body.birth_year, 2000);
  assert.equal(parsePolishInput(body).ok, true);
});
test("숫자가 아닌 키를 빈 값으로 숨기지 않는다", () => {
  assert.equal(profileFormSchema.safeParse({ ...minimum, height: "wrong" }).success, false);
  assert.equal(parsePolishInput(buildPolishRequest({ ...minimum, height: "wrong" })).ok, false);
});

test("추가 자료는 선택이며 부분 수정에서 기존 값을 지우지 않는다", () => {
  assert.deepEqual(profileWriteSchema.parse({ name: "지원자" }), { name: "지원자" });
  assert.equal(profileWriteSchema.safeParse({ training: "가".repeat(501) }).success, false);
  for (const field of ["introduction_url", "performance_url", "audio_url"]) {
    assert.equal(profileWriteSchema.safeParse({ [field]: "javascript:bad" }).success, false);
    assert.equal(profileWriteSchema.safeParse({ [field]: "https://example.com/sample" }).success, true);
    assert.equal(profileWriteSchema.safeParse({ [field]: null }).success, true);
  }
  const request = buildPolishRequest({ ...minimum, introduction_url: "https://private.example/intro", audio_url: "https://private.example/voice" });
  assert.equal("introduction_url" in request, false);
  assert.equal("audio_url" in request, false);
});
