import test from "node:test";
import assert from "node:assert/strict";
import { buildCommentTree, type RawCommentRow } from "./comments";

function row(overrides: Partial<RawCommentRow>): RawCommentRow {
  return {
    id: "id",
    post_id: "post",
    user_id: "user",
    parent_id: null,
    content: "내용",
    likes_count: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("부모 없는 댓글은 루트로, 대댓글은 부모의 replies로 들어간다", () => {
  const rows = [
    row({ id: "a", author_name: "가" }),
    row({ id: "b", parent_id: "a", author_name: "나" }),
    row({ id: "c", author_name: "다" }),
  ];
  const tree = buildCommentTree(rows);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].id, "a");
  assert.equal(tree[0].replies?.length, 1);
  assert.equal(tree[0].replies?.[0].id, "b");
  assert.equal(tree[1].id, "c");
});

test("좋아요한 댓글 id 집합이 has_liked에 반영된다", () => {
  const rows = [row({ id: "a" })];
  const tree = buildCommentTree(rows, new Set(["a"]));
  assert.equal(tree[0].has_liked, true);
});

test("author_name이 없으면 '익명'으로 대체된다", () => {
  const rows = [row({ id: "a", author_name: undefined })];
  const tree = buildCommentTree(rows);
  assert.equal(tree[0].author_name, "익명");
});
