import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bazaarSourceLabel } from "../src/lib/bazaar-catalog.ts";
import { classifyNovaSupplierCondition } from "../src/lib/bazaar-commerce.ts";

const channelMigrationUrl = new URL("../../../db/migrations/0236_bazaar_commerce_channel.sql", import.meta.url);
const transitionMigrationUrl = new URL("../../../db/migrations/0237_bazaar_condition_transition_guard.sql", import.meta.url);
const existingClassificationMigrationUrl = new URL("../../../db/migrations/0238_bazaar_existing_nova_classification.sql", import.meta.url);
const bazaarCatalogUrl = new URL("../src/lib/bazaar-catalog.ts", import.meta.url);
const bazaarPageUrl = new URL("../src/app/bazaar/page.tsx", import.meta.url);
const normalDropshipCatalogUrl = new URL("../src/lib/published-dropship-storefront.ts", import.meta.url);
const normalCustomerCommerceUrl = new URL("../../../packages/postgres-runtime/src/customer-commerce.ts", import.meta.url);
const crawlerCatalogUrl = new URL("../src/lib/crawler-catalog.ts", import.meta.url);
const siteHeaderUrl = new URL("../src/components/SiteHeader.tsx", import.meta.url);

test("NOVA condition routing keeps second-life stock out of the normal catalogue", () => {
  assert.deepEqual(classifyNovaSupplierCondition({ condition: "New" }), {
    condition: "new",
    commerceChannel: "normal",
    bazaarSource: null
  });
  assert.equal(classifyNovaSupplierCondition({ condition: "PRELOVED" }).commerceChannel, "bazaar");
  assert.equal(classifyNovaSupplierCondition({ condition: { name: "Pre-Owned / Defect" } }).commerceChannel, "bazaar");
  assert.equal(classifyNovaSupplierCondition({ condition: "Damaged packaging" }).commerceChannel, "bazaar");
});

test("canonical identity is structurally isolated by commerce channel", async () => {
  const source = await readFile(channelMigrationUrl, "utf8");
  assert.match(source, /commerce_channel text NOT NULL DEFAULT 'normal'/);
  assert.match(source, /ON public\.canonical_variants \(market_id, commerce_channel, slug\)/);
  assert.match(source, /commerce_channel = 'normal'/);
  assert.match(source, /condition NOT IN \('preloved', 'preowned_defect', 'open_box'\)/);
});

test("BAZAAR provenance supports future second-life sources and filtering", async () => {
  const [migration, catalog, page] = await Promise.all([
    readFile(channelMigrationUrl, "utf8"),
    readFile(bazaarCatalogUrl, "utf8"),
    readFile(bazaarPageUrl, "utf8")
  ]);
  for (const source of ["customer_return", "open_box", "display_stock", "damaged_packaging", "admin_curated"]) {
    assert.match(migration, new RegExp(`'${source}'`));
    assert.match(catalog, new RegExp(`"${source}"`));
  }
  assert.match(catalog, /source\?: string/);
  assert.match(catalog, /requestedSource/);
  assert.match(page, /name="source"/);
  assert.equal(bazaarSourceLabel("customer_return"), "Επιστροφή πελάτη");
  assert.equal(bazaarSourceLabel("display_stock"), "Εκθεσιακό τεμάχιο");
});

test("NOVA transitions preserve history and fail closed during rolling deployments", async () => {
  const source = await readFile(transitionMigrationUrl, "utf8");
  assert.match(source, /AFTER INSERT\s+ON public\.catalog_source_products/);
  assert.match(source, /merchant_visible = false/);
  assert.match(source, /merchant_pause_active = true/);
  assert.match(source, /#retired-channel-/);
  assert.match(source, /catalog_nova_supplier_offer_channel_guard/);
  assert.match(source, /BEFORE INSERT OR UPDATE OF supplier_id, vendor_offer_id, source_product_id/);
  assert.match(source, /ERRCODE = '23514'/);
});

test("existing second-life backfill is NOVA-scoped and fails closed on mixed evidence", async () => {
  const source = await readFile(existingClassificationMigrationUrl, "utf8");
  assert.match(source, /cs\.code = 'nova-brandsgateway'/);
  assert.match(source, /nova_bazaar_targets/);
  assert.match(source, /all_evidence/);
  assert.match(source, /target canonical variants also have normal-condition source evidence/);
  assert.match(source, /SET commerce_channel = 'bazaar'/);
  assert.match(source, /supplier_preowned_defect/);
  assert.match(source, /supplier_preloved/);
});

test("BAZAAR dropship discovery uses the same fail-closed supplier and cost gates as normal discovery", async () => {
  const source = await readFile(bazaarCatalogUrl, "utf8");
  assert.match(source, /ds\.api_authoritative_availability=true/);
  assert.match(source, /vo\.cost_ceiling_minor IS NULL OR vo\.supplier_unit_price_minor<=vo\.cost_ceiling_minor/);
  assert.match(source, /dso\.availability_expires_at>now\(\)/);
});

test("normal catalogue read models explicitly reject BAZAAR canonicals", async () => {
  const [customerCommerce, normalDropship, crawlerCatalog] = await Promise.all([
    readFile(normalCustomerCommerceUrl, "utf8"),
    readFile(normalDropshipCatalogUrl, "utf8"),
    readFile(crawlerCatalogUrl, "utf8")
  ]);
  const normalChannelGuard = /COALESCE\(cv\.commerce_channel,'normal'\)='normal'/;
  assert.match(customerCommerce, normalChannelGuard);
  assert.match(normalDropship, normalChannelGuard);
  assert.match(crawlerCatalog, normalChannelGuard);
});

test("BAZAAR navigation remains selected throughout the dedicated commerce experience", async () => {
  const source = await readFile(siteHeaderUrl, "utf8");
  assert.match(source, /href === "\/bazaar"/);
  assert.match(source, /pathname\.startsWith\("\/bazaar\/"\)/);
});
