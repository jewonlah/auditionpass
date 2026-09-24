import test from "node:test";
import assert from "node:assert/strict";
import { buildProfileDocument } from "./document";
import type { Profile } from "@/types";

test("문서는 입력 배열을 복제하고 소유자 메타데이터를 제외한다", () => {
  const input = { id: "private-user", name: " 지원자 ", genre: ["성우"], photo_urls: ["https://example.com/1.jpg"], document_version: 3 };
  const doc = buildProfileDocument(input);
  input.genre.push("배우");
  input.photo_urls[0] = "https://example.com/changed.jpg";
  assert.deepEqual(doc.profile.genre, ["성우"]);
  assert.deepEqual(doc.profile.photo_urls, ["https://example.com/1.jpg"]);
  assert.equal(doc.profile.id, undefined);
  assert.equal(doc.profile.name, "지원자");
  assert.equal(doc.version, 3);
});

test("이전 데이터는 기본 스타일, 빈 신체 정보는 null, 위험 링크는 제외", () => {
  const doc = buildProfileDocument({ height: "", other_url: "javascript:alert(1)", photo_urls: ["data:image/svg+xml,test"] } as unknown as Profile);
  assert.equal(doc.template, "casting");
  assert.equal(doc.profile.height, null);
  assert.equal(doc.profile.other_url, "");
  assert.deepEqual(doc.profile.photo_urls, []);
});

test("알 수 없는 서식은 임의 서식으로 바꾸지 않는다", () => {
  assert.throws(() => buildProfileDocument({ template_id: "unknown" } as unknown as Profile), /알 수 없는/);
});

test("세 템플릿 모두 같은 사실 정보를 유지한다", () => {
  const input = { name: "지원자", career: "2025 작품 A", birth_year: 2000 };
  const docs = (["casting", "portfolio", "career"] as const).map((template_id) => buildProfileDocument({ ...input, template_id }));
  assert.deepEqual(docs.map((d) => d.template), ["casting", "portfolio", "career"]);
  assert.deepEqual(docs[0].profile, docs[1].profile);
  assert.deepEqual(docs[1].profile, docs[2].profile);
});
