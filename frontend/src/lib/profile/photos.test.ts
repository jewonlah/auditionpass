import test from "node:test";
import assert from "node:assert/strict";
import { cropRectangle, ownedPhotoPath, photoRows } from "./photos";

test("가로·세로 사진의 크롭 양 끝이 원본 밖으로 나가지 않는다", () => {
  assert.deepEqual(cropRectangle(1600, 800, 100, 0), { left: 1000, top: 0, width: 600, height: 800 });
  assert.deepEqual(cropRectangle(600, 1200, 0, 100), { left: 0, top: 400, width: 600, height: 800 });
  assert.deepEqual(photoRows([1,2,3]), [[1,2],[3]]);
});
test("서버는 본인 버킷 경로만 사용하고 외부 URL과 다른 사용자 사진을 거부한다", () => {
  const base = "https://test.supabase.co";
  assert.equal(ownedPhotoPath(`${base}/storage/v1/object/public/profiles/me/a.jpg`, "me", base), "me/a.jpg");
  for (const url of ["http://127.0.0.1/private", `${base}/storage/v1/object/public/profiles/other/a.jpg`, `${base}/storage/v1/object/public/profiles/me/%2E%2E%2Fsecret.jpg`]) {
    assert.throws(() => ownedPhotoPath(url, "me", base));
  }
});
