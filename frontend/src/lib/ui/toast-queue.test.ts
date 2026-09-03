import test from "node:test";
import assert from "node:assert/strict";
import { toastReducer, MAX_VISIBLE_TOASTS, type ToastItem } from "./toast-queue";

function item(id: string): ToastItem {
  return { id, kind: "info", message: id };
}

test("add는 새 토스트를 뒤에 추가한다", () => {
  const next = toastReducer([item("a")], { type: "add", item: item("b") });
  assert.deepEqual(
    next.map((i) => i.id),
    ["a", "b"]
  );
});

test("add는 최대 개수를 넘기면 오래된 것부터 밀어낸다", () => {
  let items: ToastItem[] = [];
  for (let i = 0; i < MAX_VISIBLE_TOASTS + 2; i++) {
    items = toastReducer(items, { type: "add", item: item(`t${i}`) });
  }
  assert.equal(items.length, MAX_VISIBLE_TOASTS);
  assert.deepEqual(
    items.map((i) => i.id),
    ["t2", "t3", "t4"]
  );
});

test("remove는 id가 일치하는 토스트만 제거한다", () => {
  const items = [item("a"), item("b"), item("c")];
  const next = toastReducer(items, { type: "remove", id: "b" });
  assert.deepEqual(
    next.map((i) => i.id),
    ["a", "c"]
  );
});

test("remove는 없는 id면 그대로 반환한다", () => {
  const items = [item("a")];
  const next = toastReducer(items, { type: "remove", id: "z" });
  assert.deepEqual(next, items);
});
