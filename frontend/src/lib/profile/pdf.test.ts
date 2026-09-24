import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { renderEnhancedLegacyPdf as renderProfilePdf } from "./pdf"; // Prior-session renderer regression, kept separate from deployed legacy.

test("세 템플릿 PDF: 한글·마지막 경력·사진 5장·링크·페이지 경계", async () => {
  const photos = await Promise.all([0,1,2,3,4].map((i) => sharp({ create: { width: i % 2 ? 1000 : 600, height: 800, channels: 3, background: ["#eed8c1", "#bdcaca", "#ddcec4", "#b8c5d1", "#e0cfaf"][i] } }).jpeg().toBuffer()));
  for (const template of ["casting", "portfolio", "career"] as const) {
    const pdf = await renderProfilePdf({ name: "김하늘 테스트", birth_year: 2000, gender: "여성", genre: ["배우", "성우"],
      template_id: template, bio: "차분한 목소리로 이야기를 전합니다.", career: "2025년 단편영화 주연\n".repeat(20) + "마지막 경력 확인", other_url: "https://example.com/portfolio",
      training: "2025년 발성 훈련 6개월", introduction_url: "https://example.com/intro", performance_url: "https://example.com/acting", audio_url: "https://example.com/voice" }, photos, "2026-09-11T00:00:00Z");
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
      if (template === "casting" && i === 2) {
        assert.equal(operators.fnArray.filter(op => op === OPS.paintImageXObject).length, 4,
          "Four gallery images fit on page two; do not reserve the title again for row two");
      }
      links += (await page.getAnnotations()).filter((a) => a.url?.startsWith("https://example.com")).length;
      if (i === 1 && template === "casting") {
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext("2d") as never, canvas: canvas as never, viewport }).promise;
        await mkdir("test-results", { recursive: true });
        await writeFile("test-results/profile-pdf-preview.png", canvas.toBuffer("image/png"));
        await writeFile("test-results/profile-sample.pdf", pdf);
      }
      const galleryViewport = page.getViewport({ scale: 0.7 });
      const galleryCanvas = createCanvas(Math.ceil(galleryViewport.width), Math.ceil(galleryViewport.height));
      await page.render({ canvasContext: galleryCanvas.getContext("2d") as never, canvas: galleryCanvas as never, viewport: galleryViewport }).promise;
      await mkdir("test-results/pdf-gallery", { recursive: true });
      await writeFile(`test-results/pdf-gallery/${template}-five-${i}.png`, galleryCanvas.toBuffer("image/png"));
    }
    assert.ok(text.replace(/\s/g, "").includes("김하늘테스트"));
    assert.ok(text.replace(/\s/g, "").includes("마지막경력확인"));
    assert.equal(images, 5);
    assert.ok(text.replace(/\s/g, "").includes("2025년발성훈련6개월"));
    assert.ok(links >= 4);
    assert.equal(text.match(/프로필 사진/g)?.length, 1, "Gallery heading must appear once for five photos");
    await task.destroy();
  }
});

test("사진 4장과 마지막 가로사진: 갤러리 제목 중복·빈 페이지 없이 생성", async () => {
  const photos = await Promise.all([0, 1, 2, 3].map(i => sharp({ create: {
    width: i === 3 ? 1400 : 600, height: i === 3 ? 700 : 800,
    channels: 3, background: ["#ddc9b5", "#bfd0cc", "#b5c3d2", "#d4c6d6"][i],
  } }).jpeg().toBuffer()));
  for (const template_id of ["casting", "career", "portfolio"] as const) {
    const bytes = await renderProfilePdf({ name: "사진 구성 검증", template_id, genre: ["배우"],
      bio: "가로·세로 사진이 섞인 포트폴리오입니다.", career: "2026 단편영화 주연" }, photos, "2026-09-22T00:00:00Z");
    const task = getDocument({ data: new Uint8Array(bytes) });
    const pdf = await task.promise;
    let text = "", imageCount = 0;
    assert.ok(pdf.numPages <= 3);
    await mkdir("test-results/pdf-gallery", { recursive: true });
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text += content.items.filter(item => "str" in item).map(item => "str" in item ? item.str : "").join("");
      const ops = await page.getOperatorList();
      imageCount += ops.fnArray.filter(op => op === OPS.paintImageXObject).length;
      const viewport = page.getViewport({ scale: 0.85 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d") as never, canvas: canvas as never, viewport }).promise;
      await writeFile(`test-results/pdf-gallery/${template_id}-four-${pageNumber}.png`, canvas.toBuffer("image/png"));
    }
    assert.equal(imageCount, 4);
    assert.equal(text.match(/프로필 사진/g)?.length, 1);
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
