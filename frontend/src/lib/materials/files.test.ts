import test from "node:test";
import assert from "node:assert/strict";
import { materialFileError, hasMaterialSignature, MAX_MATERIAL_BYTES } from "./files";

test("자료 파일은 크기·이름·허용 형식을 검증한다", () => {
  const file = { name: "연기 프로필.pdf", type: "application/pdf", size: 1024 };
  assert.equal(materialFileError(file), null);
  for (const invalid of [{ size: 0 }, { size: MAX_MATERIAL_BYTES + 1 }, { name: "../secret.pdf" }, { name: "a\n.pdf" }, { type: "text/html" }, { type: "__proto__" }]) {
    assert.ok(materialFileError({ ...file, ...invalid }));
  }
  assert.equal(materialFileError({ ...file, size: MAX_MATERIAL_BYTES }), null);
});

test("확장자만 바꾼 파일과 짧은 헤더를 거부한다", () => {
  const bytes = new TextEncoder().encode("<html>fake PDF</html>");
  for (const type of ["application/pdf", "image/png", "video/mp4", "audio/wav", "audio/mpeg"]) assert.equal(hasMaterialSignature(bytes, type), false);
  assert.equal(hasMaterialSignature(new Uint8Array(), "audio/mpeg"), false);
  assert.equal(hasMaterialSignature(new TextEncoder().encode("%PDF-1.7\n"), "application/pdf"), true);
  assert.equal(hasMaterialSignature(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"), true);
  assert.equal(hasMaterialSignature(new TextEncoder().encode("RIFFxxxxWAVEdata"), "audio/wav"), true);
  assert.equal(hasMaterialSignature(new TextEncoder().encode("RIFFxxxxWEBPdata"), "audio/wav"), false);
});
