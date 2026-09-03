// /api/profile/polish 입력 검증 회귀 테스트 (node --test).
// 이 입력은 곧바로 선불 LLM 잔액이 걸린 프롬프트가 된다 — 캐스팅이 아니라 검증이어야 한다.

import test from "node:test";
import assert from "node:assert/strict";
import { buildFacts, parsePolishInput } from "./polish";

const CURRENT_YEAR = new Date().getFullYear();

test("정상 입력은 통과하고 팩트시트가 만들어진다", () => {
  const r = parsePolishInput({
    birth_year: 2001,
    gender: "여",
    height: 168,
    genre: ["배우"],
    activity_field: ["뮤지컬", "연극"],
    specialty: ["보컬"],
    career: "대학로 소극장 3편",
    bio: null,
  });
  assert.equal(r.ok, true);
  const facts = buildFacts(r.data!);
  assert.match(facts, /나이: 만 \d+세/);
  assert.match(facts, /활동 분야: 뮤지컬, 연극/);
  assert.match(facts, /특기: 보컬/);
});

test("문자열 genre는 거부한다 (예전엔 buildFacts에서 500)", () => {
  const r = parsePolishInput({ genre: "배우" });
  assert.equal(r.ok, false);
  assert.ok(r.error && /[가-힣]/.test(r.error), r.error);
});

test("bio 301자는 거부, 300자는 통과", () => {
  assert.equal(parsePolishInput({ bio: "가".repeat(301) }).ok, false);
  assert.equal(parsePolishInput({ bio: "가".repeat(300) }).ok, true);
});

test("career 401자·배열 11개·항목 31자는 거부", () => {
  assert.equal(parsePolishInput({ career: "가".repeat(401) }).ok, false);
  assert.equal(parsePolishInput({ specialty: Array(11).fill("보컬") }).ok, false);
  assert.equal(parsePolishInput({ specialty: ["가".repeat(31)] }).ok, false);
  assert.equal(parsePolishInput({ specialty: Array(10).fill("가".repeat(30)) }).ok, true);
});

test("범위를 벗어난 출생연도·키는 거부", () => {
  assert.equal(parsePolishInput({ birth_year: 1939 }).ok, false);
  assert.equal(parsePolishInput({ birth_year: CURRENT_YEAR + 1 }).ok, false);
  assert.equal(parsePolishInput({ birth_year: 1940 }).ok, true);
  assert.equal(parsePolishInput({ height: 99 }).ok, false);
  assert.equal(parsePolishInput({ height: 251 }).ok, false);
  assert.equal(parsePolishInput({ height: 250 }).ok, true);
});

test("문자열 숫자·NaN 나이는 거부되고, 팩트시트에 'NaN'이 절대 나오지 않는다", () => {
  assert.equal(parsePolishInput({ birth_year: "2001" }).ok, false);
  assert.equal(parsePolishInput({ birth_year: NaN }).ok, false);
  assert.equal(parsePolishInput({ height: NaN }).ok, false);
  // 방어선: 검증을 우회해 들어와도 NaN 줄은 만들지 않는다
  const facts = buildFacts({ birth_year: Number.NaN, specialty: ["보컬"] } as never);
  assert.ok(!facts.includes("NaN"), facts);
  assert.match(facts, /특기: 보컬/);
});

test("null·undefined 필드는 허용하고 빈 팩트시트를 만든다", () => {
  const r = parsePolishInput({ birth_year: null, gender: null, genre: null, career: null });
  assert.equal(r.ok, true);
  assert.equal(buildFacts(r.data!), "");
});

test("객체가 아닌 본문은 거부한다", () => {
  assert.equal(parsePolishInput("배우").ok, false);
  assert.equal(parsePolishInput(null).ok, false);
  assert.equal(parsePolishInput([1, 2]).ok, false);
});

test("activity_field가 있으면 genre 대신 그것을 쓴다", () => {
  const r = parsePolishInput({ genre: ["배우"], activity_field: ["모델"] });
  assert.equal(buildFacts(r.data!), "활동 분야: 모델");
});
