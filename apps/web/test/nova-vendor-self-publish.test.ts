import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsUrl = new URL("../src/lib/vendor-dropshipping-actions.ts", import.meta.url);
const bulkApplyUrl = new URL("../src/lib/vendor-dropshipping-bulk-apply.ts", import.meta.url);
const visibilityRouteUrl = new URL("../src/app/api/vendor/catalog/visibility/route.ts", import.meta.url);

// Supplier-offer activation is merchant catalogue intent; live stock is API-authoritative elsewhere.
test("dedicated dropshipping vendor can activate and self-approve safe supplier drafts", async () => {
  const source = await readFile(actionsUrl, "utf8");

  assert.match(source, /status === "draft" \|\| status === "approved"/);
  assert.match(source, /UPDATE dropship_supplier_offers/);
  assert.match(source, /SET active=true/);
  assert.match(source, /WHEN \$3::boolean AND status='draft' THEN 'approved'::public\.offer_status/);
  assert.match(source, /vo\.status IN \('draft','approved'\)/);
  assert.match(source, /latest_submission_status === "archived"/);
  assert.match(source, /canonical_suppressed/);
  assert.match(source, /canonical_recalled/);
  assert.doesNotMatch(source, /supplier_offer_active !== true/);
});

test("publishing a safe materialized NOVA product activates its inactive canonical", async () => {
  const source = await readFile(actionsUrl, "utf8");

  assert.match(source, /const canonicalSafetyEligible = row\.canonical_suppressed !== true\s*&& row\.canonical_recalled !== true/);
  assert.match(source, /UPDATE canonical_variants\s+SET active=true\s+WHERE id=\$1::uuid\s+AND suppressed=false\s+AND recalled=false/);
  assert.match(source, /'canonical_activated',\(\$3::boolean AND NOT \$8::boolean\)/);
  assert.doesNotMatch(source, /const canonicalEligible = row\.canonical_active === true/);
});

test("product visibility route uses the dropshipping self-publish path only for the dropshipping vendor", async () => {
  const source = await readFile(visibilityRouteUrl, "utf8");

  assert.match(source, /isDropshippingOnlyVendor\(principal\.vendorId\)/);
  assert.match(source, /setDropshippingProductVisibility\(principal\.vendorId, principal\.userId, offerId, body\.visible\)/);
  assert.match(source, /setVendorProductVisibility\(principal, \{ offerId, visible: body\.visible \}\)/);
});

test("public supplier defaults activate safe canonicals, supplier rows and drafts while safety gates remain enforced", async () => {
  const source = await readFile(bulkApplyUrl, "utf8");

  assert.match(source, /UPDATE canonical_variants cv\s+SET active=true/);
  assert.match(source, /UPDATE dropship_supplier_offers dso/);
  assert.match(source, /SET active=true/);
  assert.match(source, /vo\.status='draft'/);
  assert.match(source, /THEN 'approved'::public\.offer_status/);
  assert.match(source, /vo\.status NOT IN \('draft','approved'\)/);
  assert.match(source, /s\.status='archived'/);
  assert.match(source, /cv\.suppressed=false/);
  assert.match(source, /cv\.recalled=false/);
  assert.match(source, /cv\.suppressed/);
  assert.match(source, /cv\.recalled/);
});
