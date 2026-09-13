import test from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { ApplicationEmail } from "../email/templates/application";

test("지원 메일에 교육과 종류별 자료 링크를 포함하고 문장을 이스케이프한다", async () => {
  const html = await render(ApplicationEmail({ auditionTitle: "로컬 테스트", applicantName: "지원자",
    applicantAgeLabel: "2000년생", applicantGender: "여성", photoUrls: [],
    applicantTraining: "발성 수업 <script>bad</script>", introductionUrl: "https://example.com/intro",
    performanceUrl: "https://example.com/acting", audioUrl: "https://example.com/voice" }));
  assert.ok(html.includes("교육·트레이닝"));
  assert.ok(!html.includes("<script>bad</script>"));
  for (const path of ["intro", "acting", "voice"]) assert.ok(html.includes(`href="https://example.com/${path}"`));
});
