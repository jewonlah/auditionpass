// JSON-LD 직렬화 회귀 테스트 (node --test).
// 공고 본문은 크롤·LLM이 만든 신뢰할 수 없는 텍스트다 — 여기가 뚫리면 저장형 XSS.

import test from "node:test";
import assert from "node:assert/strict";
import { serializeJsonLd } from "./jsonld";

const PAYLOAD = '</script><script>alert(1)</script>';

test("</script> 페이로드가 출력에 리터럴로 남지 않는다", () => {
  const out = serializeJsonLd({ description: PAYLOAD });
  assert.ok(!out.includes("</script>"), out);
  assert.ok(!out.includes("<"), out);
  assert.ok(!out.includes(">"), out);
  assert.ok(out.includes("\\u003c"));
});

test("JSON.parse 왕복이 원문과 같다 (검색엔진이 읽는 값은 그대로)", () => {
  const obj = {
    "@context": "https://schema.org",
    title: PAYLOAD,
    description: "참가비 5만원 & <b>강조</b>",
    requirements: null,
    nested: { arr: ["a<b", "c>d", "e&f"] },
  };
  assert.deepEqual(JSON.parse(serializeJsonLd(obj)), obj);
});

test("& 도 이스케이프된다 (HTML 엔티티 재해석 차단)", () => {
  const out = serializeJsonLd({ a: "&amp;" });
  assert.ok(!out.includes("&"), out);
  assert.equal(JSON.parse(out).a, "&amp;");
});

test("U+2028/U+2029 는 이스케이프되고 값은 보존된다", () => {
  const s = `줄${String.fromCharCode(0x2028)}구분${String.fromCharCode(0x2029)}단락`;
  const out = serializeJsonLd({ s });
  assert.ok(!out.includes(String.fromCharCode(0x2028)));
  assert.ok(!out.includes(String.fromCharCode(0x2029)));
  assert.equal(JSON.parse(out).s, s);
});
