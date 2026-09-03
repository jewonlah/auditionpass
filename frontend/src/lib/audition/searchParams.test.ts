import test from "node:test";
import assert from "node:assert/strict";
import { parseAuditionsSearchParams } from "./searchParams";

test("빈 쿼리는 기본값(전체 필터·빈 검색어)으로 파싱된다", () => {
  assert.deepEqual(parseAuditionsSearchParams(undefined), { filter: "전체", q: "" });
  assert.deepEqual(parseAuditionsSearchParams({}), { filter: "전체", q: "" });
});

test("filter·q 값을 그대로 읽는다", () => {
  assert.deepEqual(
    parseAuditionsSearchParams({ filter: "원클릭지원", q: " 뮤지컬 " }),
    { filter: "원클릭지원", q: "뮤지컬" }
  );
});

test("반복 쿼리 파라미터는 배열의 첫 값만 사용한다", () => {
  assert.deepEqual(
    parseAuditionsSearchParams({ filter: ["배우", "모델"], q: undefined }),
    { filter: "배우", q: "" }
  );
});
