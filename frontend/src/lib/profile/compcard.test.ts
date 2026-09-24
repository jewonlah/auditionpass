import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderProfilePdf } from "./pdf";
import { COMPCARD_TEMPLATES } from "./templates";

test("원본 5종: 긴 한글 경력·사진 5장·전체 페이지를 보존한다", async () => {
  const photos = await Promise.all([0,1,2,3,4].map(i => sharp({ create: { width: i % 2 ? 900 : 600, height: 800, channels: 3, background: "#dddddd" } }).jpeg().toBuffer()));
  for (const template of COMPCARD_TEMPLATES) {
    const bytes = await renderProfilePdf({ template_id: template.id, name: "검증지원자", career: "2026 독립영화 주연\n".repeat(30) + "마지막활동", education: "교육확인", awards: "수상확인" }, photos, "2026-09-22T00:00:00Z");
    const task = getDocument({ data: new Uint8Array(bytes) }); const pdf = await task.promise;
    let text = "", images = 0;
    assert.ok(pdf.numPages <= 5, template.id);
    for (let n=1;n<=pdf.numPages;n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      for (const item of content.items) if ("str" in item) { text += item.str; assert.ok(item.transform[5] >= 0 && item.transform[5] < 842); }
      images += (await page.getOperatorList()).fnArray.filter(op => op === OPS.paintImageXObject).length;
    }
    assert.equal(images, 5, template.id);
    assert.ok(text.replace(/\s/g, "").includes("마지막활동"));
    assert.ok(text.includes("교육확인") && text.includes("수상확인"));
    await task.destroy();
  }
});
test("렌더러와 서식이 맞지 않으면 저장본을 다른 디자인으로 재생성하지 않는다", async () => {
  await assert.rejects(renderProfilePdf({ template_id: "cinema" }, [], "2026-09-22", "legacy-v1"), /렌더러/);
  await assert.rejects(renderProfilePdf({ template_id: "classic" }, [], "2026-09-22", "unknown"), /렌더러/);
});
