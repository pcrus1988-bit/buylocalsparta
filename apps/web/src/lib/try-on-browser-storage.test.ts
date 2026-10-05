import assert from "node:assert/strict";
import test from "node:test";
import {
  clearCustomerTryOnBrowserStorage,
  TRY_ON_ACTIVE_SCOPE_KEY,
  TRY_ON_LEGACY_MODEL_KEY,
  TRY_ON_LEGACY_PREVIEW_PREFIX,
  TRY_ON_MODEL_PREFIX,
  TRY_ON_PREVIEW_PREFIX,
  type TryOnBrowserStorage
} from "./try-on-browser-storage.ts";

class MemoryStorage implements TryOnBrowserStorage {
  readonly values = new Map<string, string>();

  get length() { return this.values.size; }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("Try On logout cleanup removes model photos, previews and scope markers only", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();

  local.setItem(`${TRY_ON_MODEL_PREFIX}scope-a`, "photo-a");
  local.setItem(`${TRY_ON_MODEL_PREFIX}scope-b`, "photo-b");
  local.setItem(TRY_ON_ACTIVE_SCOPE_KEY, "scope-a");
  local.setItem(TRY_ON_LEGACY_MODEL_KEY, "legacy-photo");
  local.setItem("km:cart:v1", "keep-cart");

  session.setItem(`${TRY_ON_PREVIEW_PREFIX}scope-a:product-a`, "preview");
  session.setItem(`${TRY_ON_LEGACY_PREVIEW_PREFIX}product-b`, "legacy-preview");
  session.setItem("checkout:return-url", "/checkout");

  const removed = clearCustomerTryOnBrowserStorage({ localStorage: local, sessionStorage: session });

  assert.equal(removed, 6);
  assert.deepEqual([...local.values.keys()], ["km:cart:v1"]);
  assert.deepEqual([...session.values.keys()], ["checkout:return-url"]);
});
