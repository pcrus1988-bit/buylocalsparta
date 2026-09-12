import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/components/DropshippingFilteredPageBulkActions.tsx", import.meta.url);

test("filtered-page Dropshipping bulk actions reuse the existing public presentation API", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /Bulk public fields · current page/);
  assert.match(source, /\/api\/vendor\/dropshipping\/presentation/);
  assert.match(source, /action: "save-product", offerId, fields: publicFields/);
  assert.match(source, /action: "reset-product", offerId/);
  assert.match(source, /runBounded\(offerIds/);
  assert.match(source, /setPublicField\("supplierSku"/);
  assert.match(source, /Use supplier field defaults/);
});
