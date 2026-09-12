import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/lib/dropship-checkout-runtime.ts", import.meta.url);

test("Nova checkout snapshots the live revalidated supplier buying cost", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /validated\.push\(\{ row, quantity: item\.quantity, supplierCostMinor: evidence\.supplierCostMinor/);
  assert.match(source, /lineTax,\s*line\.supplierCostMinor,\s*JSON\.stringify\(\{ postcode:/s);
  assert.doesNotMatch(source, /lineTax,\s*retailMinor,\s*JSON\.stringify\(\{ postcode:/s);
});
