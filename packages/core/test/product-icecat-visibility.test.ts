import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Icecat provenance is visible without granting Icecat control over vendor commerce state", () => {
  const runtime = read("apps/web/src/lib/product-icecat-visibility.ts");
  const panel = read("apps/web/src/components/ProductIcecatVisibilityPanel.tsx");
  const vendorPage = read("apps/web/src/app/vendor/catalog/page.tsx");
  const adminPage = read("apps/web/src/app/admin/catalogue-intake/page.tsx");

  assert.match(runtime, /requiredVendorId\(principal/);
  assert.match(runtime, /JOIN vendor v ON v\.id=vo\.vendor_id/);
  assert.match(runtime, /vca\.assortment_status NOT IN \('rejected','discontinued'\)/);
  assert.match(runtime, /ics\.code='open_icecat'/);
  assert.match(runtime, /il\.link_status='approved'/);
  assert.match(runtime, /assertAdminPermission\(principal, "catalog\.read"\)/);

  assert.match(panel, /Δεν αλλάζει το δικό σου SKU, την τιμή προμηθευτή\/πώλησης, το φυσικό stock, την ορατότητα ή την έγκριση του offer/);
  assert.match(panel, /canonical publication and commerce state stay separately governed/);
  assert.match(vendorPage, /VendorProductIcecatVisibilityPanel/);
  assert.match(adminPage, /AdminProductIcecatVisibilityPanel/);
});

test("Icecat visibility exposes provenance and localization quality, not secret pricing", () => {
  const runtime = read("apps/web/src/lib/product-icecat-visibility.ts");
  for (const field of [
    "source_locale",
    "content_origin",
    "greek_completeness",
    "quality_status",
    "quality_missing",
    "specifications",
    "provider_product_id"
  ]) assert.ok(runtime.includes(field), `missing Icecat provenance field: ${field}`);

  assert.ok(!runtime.includes("buying_price"));
  assert.ok(!runtime.includes("supplier_cost"));
  assert.ok(!runtime.includes("cost_price"));
});
