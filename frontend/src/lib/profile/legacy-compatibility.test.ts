import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderProfilePdf } from "./pdf";

test("실제 legacy 저장본 렌더러는 배포 기준 HEAD 원본을 유지한다", async () => {
  const source = (await readFile("src/lib/profile/pdf-legacy.ts", "utf8")).replace(/renderLegacyProfilePdf/g,"renderProfilePdf").replace(/\r\n/g,"\n").trim();
  // Independently computed from git show 7f256d5:frontend/src/lib/profile/pdf.ts.
  assert.equal(createHash("sha256").update(source).digest("hex"), "1f02bc05331ae9645af615aae86bffe2550e131a11c5fe33b32078bb16d0b3b3");
  const photo = await sharp({ create: { width: 120, height: 160, channels: 3, background: "#eeeeee" } }).jpeg().toBuffer();
  const bytes = await renderProfilePdf({ template_id: "casting", name: "이전프로필", birth_year: 2000, gender: "여성", genre: ["배우"] }, [photo], "2026-09-21T00:00:00Z", "legacy-v1");
  const task = getDocument({ data: new Uint8Array(bytes) }); const pdf = await task.promise;
  assert.equal(pdf.numPages,1);
  const page = await pdf.getPage(1);
  const text = (await page.getTextContent()).items.map(item => "str" in item ? item.str : "").join("");
  assert.ok(text.includes("이전프로필"));
  assert.equal((await page.getOperatorList()).fnArray.filter(op => op === OPS.paintImageXObject).length,1);
  await task.destroy();
});
