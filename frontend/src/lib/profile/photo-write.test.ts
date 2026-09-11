import test from "node:test";
import assert from "node:assert/strict";
import { profilePhotoWriteError } from "./photo-write";
import { profileWriteSchema } from "./form";

const storage = "https://project.supabase.co";
const ownPhoto = `${storage}/storage/v1/object/public/profiles/owner/photo.jpg`;

test("본인 저장소 사진과 사진 전체 제외를 허용한다", () => {
  assert.equal(profilePhotoWriteError({ photo_urls: [ownPhoto] }, "owner", storage), null);
  assert.equal(profilePhotoWriteError({ photo_urls: [] }, "owner", storage), null);
});

test("외부 사진과 다른 프로젝트 사진은 재업로드 안내로 거절한다", () => {
  for (const url of ["https://example.com/photo.jpg", ownPhoto.replace("project.supabase.co", "other.supabase.co")]) {
    const input = profileWriteSchema.parse({ photo_urls: [url] });
    assert.deepEqual(profilePhotoWriteError(input, "owner", storage), {
      error: "프로필 사진을 다시 업로드한 뒤 저장해주세요.",
      code: "PROFILE_PHOTO_REUPLOAD_REQUIRED",
    });
  }
});

test("타인 사진과 PDF가 읽지 않는 경로를 저장하지 않는다", () => {
  for (const url of [ownPhoto.replace("/owner/", "/other/"), `${ownPhoto}?token=value`, ownPhoto.replace(".jpg", ".gif")]) {
    assert.equal(profilePhotoWriteError({ photo_urls: [ownPhoto, url] }, "owner", storage)?.code, "PROFILE_PHOTO_REUPLOAD_REQUIRED");
  }
});

test("사진을 제출하지 않는 다른 필드 수정은 기존 외부 사진을 유지한다", () => {
  const existing = { name: "지원자", template_id: "career", activity_field: ["연극"], photo_urls: ["https://legacy.example.com/photo.jpg"] };
  const update = profileWriteSchema.parse({ name: "수정한 이름" });
  assert.equal(profilePhotoWriteError(update, "owner", storage), null);
  assert.equal(Object.hasOwn(update, "photo_urls"), false);
  const saved = { ...existing, ...update };
  assert.equal(saved.name, "수정한 이름");
  assert.deepEqual(saved.photo_urls, existing.photo_urls);
  assert.deepEqual(saved, { ...existing, name: "수정한 이름" });
});

test("명시한 템플릿 변경과 활동 분야 비우기는 부분 수정에 반영한다", () => {
  assert.deepEqual(profileWriteSchema.parse({ template_id: "portfolio", activity_field: [] }), {
    template_id: "portfolio", activity_field: [],
  });
  assert.deepEqual(profileWriteSchema.parse({}), {});
});
