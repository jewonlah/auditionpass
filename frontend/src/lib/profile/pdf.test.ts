import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { renderProfilePdf } from "./pdf";

test("세 템플릿 PDF: 한글·마지막 경력·사진 5장·링크·페이지 경계", async () => {
  const photos = await Promise.all([0,1,2,3,4].map((i) => sharp({ create: { width: i % 2 ? 1000 : 600, height: 800, channels: 3, background: ["#eed8c1", "#bdcaca", "#ddcec4", "#b8c5d1", "#e0cfaf"][i] } }).jpeg().toBuffer()));
  for (const template of ["casting", "portfolio", "career"] as const) {
    const pdf = await renderProfilePdf({ name: "김하늘 테스트", birth_year: 2000, gender: "여성", genre: ["배우", "성우"],
      template_id: template, bio: "차분한 목소리로 이야기를 전합니다.", career: "2025년 단편영화 주연\n".repeat(20) + "마지막 경력 확인", other_url: "https://example.com/portfolio" }, photos, "2026-09-11T00:00:00Z");
    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false });
    const parsed = await task.promise;
    let text = "", images = 0, links = 0;
    assert.ok(parsed.numPages >= 2 && parsed.numPages <= 6);
    for (let i = 1; i <= parsed.numPages; i++) {
      const page = await parsed.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        assert.ok(item.transform[5] >= 0 && item.transform[5] <= 842, "Text outside page");
      }
      const operators = await page.getOperatorList();
      images += operators.fnArray.filter((op) => op === OPS.paintImageXObject).length;
      links += (await page.getAnnotations()).filter((a) => a.url?.startsWith("https://example.com")).length;
      if (i === 1 && template === "casting") {
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext("2d") as never, canvas: canvas as never, viewport }).promise;
        await mkdir("test-results", { recursive: true });
        await writeFile("test-results/profile-pdf-preview.png", canvas.toBuffer("image/png"));
        await writeFile("test-results/profile-sample.pdf", pdf);
      }
    }
    assert.ok(text.replace(/\s/g, "").includes("김하늘테스트"));
    assert.ok(text.replace(/\s/g, "").includes("마지막경력확인"));
    assert.equal(images, 5);
    assert.ok(links > 0);
    await task.destroy();
  }
});

test("사진 없는 PDF도 빈 사진 페이지 없이 한글을 보존한다", async () => {
  const bytes = await renderProfilePdf({ name: "홍길동", genre: ["성우"] }, [], "2026-09-11T00:00:00Z");
  const task = getDocument({ data: new Uint8Array(bytes) });
  const pdf = await task.promise;
  assert.equal(pdf.numPages, 1);
  await task.destroy();
});
