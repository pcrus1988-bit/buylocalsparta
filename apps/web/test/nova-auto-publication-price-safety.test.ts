import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("NOVA auto-publication requires strictly positive supplier and customer prices", () => {
  const source = readFileSync(
    new URL("../src/lib/nova-auto-publication-runtime.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /AND dso\.supplier_cost_minor>0/);
  assert.match(source, /AND vo\.customer_price_minor>0/);
  assert.match(source, /AND vo\.customer_price_minor>=dso\.supplier_cost_minor/);
  assert.doesNotMatch(source, /AND dso\.supplier_cost_minor>=0/);
});

test("NOVA auto-publication does not use approved_at as an inventory or publication shortcut", () => {
  const source = readFileSync(
    new URL("../src/lib/nova-auto-publication-runtime.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /approved_at/);
});
