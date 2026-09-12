import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/lib/public-product-variants.ts", import.meta.url);

test("NOVA customer-facing size attributes are projected as size variants", async () => {
  const source = await readFile(sourceUrl, "utf8");

  for (const key of [
    "italian size men",
    "italian size women",
    "shoe size men",
    "shoe size women",
    "shoe size",
    "waist size",
    "belt size",
    "waist length size",
    "hat size",
    "swimwear sleepwear size",
    "earrings size",
    "bracelets size",
    "gloves size women",
    "ring size"
  ]) {
    assert.match(source, new RegExp(`\\"${key}\\"`));
  }

  assert.match(source, /NOVA_SIZE_KEYS\.has\(normalized\)/);
  assert.match(source, /label: "Μέγεθος", kind: "size"/);
});

test("variant chooser accepts fresh authoritative dropship availability without inventing local inventory", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /JOIN dropship_supplier_offers dso ON dso\.vendor_offer_id=vo\.id/);
  assert.match(source, /JOIN dropship_suppliers ds ON ds\.id=dso\.supplier_id/);
  assert.match(source, /ds\.api_authoritative_availability=true/);
  assert.match(source, /dso\.cached_available=true/);
  assert.match(source, /dso\.cached_quantity IS NULL OR dso\.cached_quantity>=1/);
  assert.match(source, /dso\.availability_expires_at IS NOT NULL/);
  assert.match(source, /dso\.availability_expires_at>now\(\)/);
  assert.match(source, /vo\.merchant_visible=true/);
  assert.match(source, /vo\.merchant_pause_active=false/);

  // Local inventory remains a separate eligibility source; supplier stock must not
  // be copied into inventory_balances just to make the selector appear available.
  assert.match(source, /JOIN inventory_balances ib ON ib\.offer_id=vo\.id/);
  assert.doesNotMatch(source, /(?:INSERT|UPDATE)\s+(?:INTO\s+)?inventory_balances/i);
});
