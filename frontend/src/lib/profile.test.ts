// 출생연도 검증 회귀 테스트 (node --test).
// 만 14세 미만 차단은 약관·개인정보처리방침에 고지한 내용이다(개인정보 보호법 제22조의2).
// 상한이 하드코딩으로 되돌아가면(직전 코드 `max(2015)`) 해가 바뀔 때 조용히 뚫린다 — 여기서 잡는다.

import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_BIRTH_YEAR,
  MIN_SIGNUP_AGE,
  maxBirthYear,
  sanitizeProfileBody,
  validateAgeFields,
  validateBirthYear,
} from "./profile";

// 고정 시점으로 경계를 검사한다 — 실제 연도에 의존하면 매년 테스트 의미가 바뀐다.
const NOW = new Date("2026-06-15T00:00:00Z");
const MAX = maxBirthYear(NOW); // 2012

test("만 14세 경계 — 딱 14세는 통과, 13세는 UNDERAGE", () => {
  assert.equal(MAX, NOW.getFullYear() - MIN_SIGNUP_AGE);
  assert.equal(validateBirthYear(MAX, NOW), null);
  assert.equal(validateBirthYear(MAX + 1, NOW)?.code, "UNDERAGE");
});

test("범위 밖 출생연도는 INVALID_BIRTH_YEAR", () => {
  // 하한은 ProfileForm·polish 의 min(1940) 과 같아야 한다 — 서버가 더 헐거우면 폼 우회로 뚫린다.
  assert.equal(validateBirthYear(1939, NOW)?.code, "INVALID_BIRTH_YEAR");
  assert.equal(validateBirthYear(MIN_BIRTH_YEAR, NOW), null);
  assert.equal(MIN_BIRTH_YEAR, 1940);
  assert.equal(validateBirthYear(NOW.getFullYear() + 1, NOW)?.code, "INVALID_BIRTH_YEAR");
  assert.equal(validateBirthYear("abc", NOW)?.code, "INVALID_BIRTH_YEAR");
  assert.equal(validateBirthYear(2000.5, NOW)?.code, "INVALID_BIRTH_YEAR");
});

test("값이 없으면 검사하지 않는다 — 부분 수정 요청 허용", () => {
  assert.equal(validateBirthYear(null, NOW), null);
  assert.equal(validateBirthYear(undefined, NOW), null);
  // 빈 문자열은 "미제공"이다. Number("") === 0 이라 강제 변환만 하면 INVALID 로 오판한다.
  assert.equal(validateBirthYear("", NOW), null);
});

// 결함 D1: getMissingFields 가 age 를 birth_year 대체로 인정하므로,
// birth_year 만 검사하는 가드는 age 만 보내는 요청에 무력하다.
test("age 우회 — birth_year 없이 age 만 보내도 만 14세 미만은 UNDERAGE", () => {
  assert.equal(validateAgeFields({ age: 10 }, NOW)?.code, "UNDERAGE");
  assert.equal(validateAgeFields({ age: "10" }, NOW)?.code, "UNDERAGE"); // JSON 문자열도 PG 가 캐스팅한다
  assert.equal(validateAgeFields({ age: MIN_SIGNUP_AGE }, NOW), null);
  assert.equal(validateAgeFields({ age: 30 }, NOW), null);
});

// 결함 D8: 폼에서 출생연도를 지우면 "" 가 온다. 검증은 통과시키되(미제공) 그대로
// insert 하면 int 컬럼 캐스팅 실패로 500 이므로 null 로 바꿔 저장한다.
test("빈 문자열 birth_year·age 는 검증 통과 후 null 로 바뀐다", () => {
  const body = sanitizeProfileBody({ name: "홍길동", birth_year: "", age: "" });
  assert.equal(validateAgeFields(body, NOW), null);
  assert.equal(body.birth_year, null);
  assert.equal(body.age, null);
  assert.equal(body.name, "홍길동"); // 다른 필드는 건드리지 않는다
});

// 결함 D2: 소유자·타임스탬프 컬럼을 클라이언트가 정하지 못하게 한다.
test("id·created_at·updated_at 는 본문에서 제거된다", () => {
  const body = sanitizeProfileBody({
    id: "00000000-0000-0000-0000-000000000001",
    created_at: "2020-01-01",
    updated_at: "2020-01-01",
    name: "홍길동",
  });
  assert.deepEqual(body, { name: "홍길동" });
  assert.deepEqual(sanitizeProfileBody(null), {});
});

test("validateAgeFields — 미제공·정상값 통과, birth_year 오류가 우선", () => {
  assert.equal(validateAgeFields(null, NOW), null);
  assert.equal(validateAgeFields({}, NOW), null);
  assert.equal(validateAgeFields({ age: "" }, NOW), null);
  assert.equal(validateAgeFields({ age: null }, NOW), null);
  assert.equal(validateAgeFields({ birth_year: "", age: 30 }, NOW), null);
  assert.equal(validateAgeFields({ birth_year: 1939, age: 30 }, NOW)?.code, "INVALID_BIRTH_YEAR");
  // birth_year 가 성인이어도 age 가 미성년이면 막는다 (둘 다 저장되므로).
  assert.equal(validateAgeFields({ birth_year: 1990, age: 10 }, NOW)?.code, "UNDERAGE");
});

test("상한은 하드코딩이 아니라 실행 시점 기준으로 움직인다", () => {
  assert.equal(maxBirthYear(new Date("2030-01-01T00:00:00Z")), 2016);
  // 2026년 기준으로 통과하던 2012년생은 2027년에도 여전히 통과해야 한다(만 15세).
  assert.equal(validateBirthYear(2012, new Date("2027-01-01T00:00:00Z")), null);
});

test("메시지는 한국어 안내 톤", () => {
  assert.equal(validateBirthYear(MAX + 1, NOW)?.message, "만 14세 이상만 가입할 수 있습니다.");
});
