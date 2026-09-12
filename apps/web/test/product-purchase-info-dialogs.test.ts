import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/components/ProductPurchaseInfoDialogs.tsx", import.meta.url);

test("delivery and returns information stays on the product page", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /Παράδοση &amp; παραλαβή ›/);
  assert.match(source, /Επιστροφές &amp; refunds ›/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);

  // These controls open an in-page overlay rather than navigating away.
  assert.doesNotMatch(source, /href="\/delivery-pickup"/);
  assert.doesNotMatch(source, /href="\/returns-refunds"/);
});
