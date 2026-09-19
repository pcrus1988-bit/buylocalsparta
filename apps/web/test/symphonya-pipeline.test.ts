import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { symphonyaAutoPricingEnabled } from "../src/lib/symphonya-auto-pricing-runtime.ts";
import { symphonyaAutoPublicationEnabled } from "../src/lib/symphonya-auto-publication-runtime.ts";
import { resolveSymphonyaCategoryCode } from "../src/lib/symphonya-category-mapping.ts";
import { normalizeSymphonyaGlobalIdentifier } from "../src/lib/symphonya-catalogue-materializer.ts";

test("Symphonya automatic pricing is on by default but can be explicitly disabled", () => {
  assert.equal(symphonyaAutoPricingEnabled({} as NodeJS.ProcessEnv), true);
  assert.equal(symphonyaAutoPricingEnabled({ BLS_SYMPHONYA_AUTO_PRICING_ENABLED: "false" } as NodeJS.ProcessEnv), false);
  assert.equal(symphonyaAutoPricingEnabled({ BLS_SYMPHONYA_AUTO_PRICING_ENABLED: "TRUE" } as NodeJS.ProcessEnv), true);
});


test("Symphonya automatic publication is on by default but can be explicitly disabled", () => {
  assert.equal(symphonyaAutoPublicationEnabled({} as NodeJS.ProcessEnv), true);
  assert.equal(symphonyaAutoPublicationEnabled({ BLS_SYMPHONYA_AUTO_PUBLICATION_ENABLED: "false" } as NodeJS.ProcessEnv), false);
  assert.equal(symphonyaAutoPublicationEnabled({ BLS_SYMPHONYA_AUTO_PUBLICATION_ENABLED: "TRUE" } as NodeJS.ProcessEnv), true);
});

test("Symphonya publication does not depend on automatic supplier-order forwarding", () => {
  const source = readFileSync(new URL("../src/lib/symphonya-auto-publication-runtime.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /publicationEnabled\s*=\s*symphonyaAutoPublicationEnabled\(\)\s*&&\s*orderForwardingEnabled/);
  assert.doesNotMatch(source, /AND ds\.order_forwarding_enabled=true/);
  assert.match(source, /pt\.locale='el'/);
  assert.match(source, /vo\.status::text IN \('draft','approved','archived'\)/);
  assert.match(source, /vendor_product_submissions/);
  assert.match(source, /vendor_product_activation_requests ar/);
});

test("API-authoritative checkout live-revalidates Symphonya stock and buying cost", () => {
  const source = readFileSync(new URL("../src/lib/dropship-checkout-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /SYMPHONYA_SUPPLIER_CODE = "symphonya"/);
  assert.match(source, /new SymphonyaHttpTransport/);
  assert.match(source, /getStock\(\{ productIds: \[row\.external_product_id\] \}\)/);
  assert.match(source, /stock\.wholesaleCostMinor/);
  assert.match(source, /row\.order_forwarding_enabled/);
  assert.match(source, /SYMPHONYA_ENABLED/);
  assert.match(source, /minimum_procurement_minor/);
});

test("paid Symphonya fulfilment uses an at-most-once supplier submission bridge", () => {
  const source = readFileSync(new URL("../src/lib/symphonya-paid-fulfilment.ts", import.meta.url), "utf8");
  assert.match(source, /status='creating'/);
  assert.match(source, /submission_started_at/);
  assert.match(source, /adapter\.createOrder\(request\)/);
  assert.match(source, /status='submission_uncertain'/);
});

test("Symphonya all-phase pipeline leaves automatic supplier stock I/O to the dedicated cron", () => {
  const source = readFileSync(new URL("../src/app/api/cron/symphonya-pipeline/route.ts", import.meta.url), "utf8");
  assert.match(source, /const stockIds = phase === "stock"/);
  assert.doesNotMatch(source, /runAll \|\| phase === "stock"/);
  assert.match(source, /const publication = runAll \|\| phase === "publication"/);
});

test("Symphonya enrichment prioritizes latest, fresh, untranslated in-stock evidence", () => {
  const preparation = readFileSync(new URL("../src/lib/symphonya-enrichment-runtime.ts", import.meta.url), "utf8");
  const generation = readFileSync(new URL("../src/lib/catalogue-enrichment-generation-runtime.ts", import.meta.url), "utf8");
  assert.match(preparation, /catalog_source_product_latest/);
  assert.match(preparation, /dso\.cached_available=true/);
  assert.match(generation, /\$4::text='symphonya'/);
  assert.match(generation, /dso\.cached_available=true/);
  assert.match(generation, /dso\.availability_expires_at>now\(\)/);
  assert.match(generation, /JOIN public\.product_translations pt/);
  assert.match(generation, /pt\.locale='el'/);
});

test("Symphonya structured Beauty taxonomy maps to existing KONTA MOY product classes", () => {
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Fragrance", scat: "Perfumes", sscat: "Eau De Parfum" } }), "fragrance");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Makeup", scat: "Lips", sscat: "Cream Lipstick" } }), "lip-makeup");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Makeup", scat: "Eyes", sscat: "Mascara" } }), "eye-makeup");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Makeup", scat: "Face", sscat: "Liquid Foundation" } }), "face-makeup");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Makeup", scat: "Nails", sscat: "Nail Polish" } }), "nail-care-colour");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Skin", scat: "Cleansing & Exfoliating", sscat: "Micellar Water" } }), "facial-cleansers");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Skin", scat: "Skin Care", sscat: "Serum" } }), "serums-treatments");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Skin", scat: "Skin Care", sscat: "Cream" } }), "face-moisturisers");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Hair", scat: "Hair Care", sscat: "Hair Shampoo" } }), "shampoo-conditioner");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Hair", scat: "Hair Styling", sscat: "Hair Spray" } }), "hair-styling-products");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Body", scat: "Shower & Bath", sscat: "Shower Gel" } }), "bath-body-care");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Room Scents", scat: "Candles", sscat: "Scented Candle" } }), "candles-home-fragrance");
});

test("unknown Symphonya taxonomy fails closed instead of inventing a category", () => {
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Fashion", scat: "Gifts", sscat: "GWP Textile Pouch" } }), null);
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: {} }), null);
});

test("Symphonya canonical matching only accepts checksum-valid GTINs", () => {
  assert.deepEqual(normalizeSymphonyaGlobalIdentifier("8028713250774"), {
    type: "gtin13",
    value: "8028713250774"
  });
  assert.equal(normalizeSymphonyaGlobalIdentifier("1234567890123"), null);
  assert.equal(normalizeSymphonyaGlobalIdentifier("ABC-123"), null);
});


test("Symphonya materialization uses latest immutable evidence with a supplier-scoped lease", () => {
  const source = readFileSync(new URL("../src/lib/symphonya-catalogue-materializer.ts", import.meta.url), "utf8");
  assert.match(source, /FROM public\.catalog_source_product_latest p/);
  assert.match(source, /ORDER BY p\.source_product_key/);
  assert.match(source, /symphonyaMaterializationLease/);
  assert.match(source, /linked_source\.source_product_key=\$2/);
  assert.match(source, /historical_source_link_collision/);
});

test("Symphonya Vercel crons stay bounded while full catch-up belongs to the long-running worker", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const catalogue = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-catalogue");
  const stock = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-stock");
  const pipeline = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-pipeline");
  const materialization = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-materialization");
  assert.equal(catalogue?.schedule, "2 * * * *");
  assert.equal(stock?.schedule, "7,17,27,37,47,57 * * * *");
  assert.equal(pipeline?.schedule, "9 * * * *");
  assert.equal(materialization, undefined);
});

test("Symphonya long-running worker generates Greek copy before promotion and publication", () => {
  const source = readFileSync(new URL("../../../workers/symphonya-worker.ts", import.meta.url), "utf8");
  const preparation = source.indexOf("runSymphonyaEnrichmentPreparationSlice");
  const generation = source.indexOf("runCatalogueEnrichmentGenerationSlice", preparation);
  const promotion = source.indexOf("runCatalogueEnrichmentPromotionSlice", generation);
  const publication = source.indexOf("runSymphonyaAutoPublicationSweep", promotion);
  assert.ok(preparation >= 0 && generation > preparation && promotion > generation && publication > promotion);
  assert.match(source, /supplierCode: "symphonya"/);
});


test("vendor storefront surfaces newly published Symphonya families before the hourly read-model refresh", () => {
  const source = readFileSync(new URL("../src/lib/vendor-dropship-fast-page.ts", import.meta.url), "utf8");
  assert.match(source, /hot_symphonya AS MATERIALIZED/);
  assert.match(source, /supplier\.code='symphonya'/);
  assert.match(source, /NOT EXISTS \([\s\S]*storefront_dropship_family_read_model projected/);
  assert.match(source, /LEFT JOIN public\.storefront_catalog_read_model rm/);
  assert.match(source, /vo\.status='approved'/);
  assert.match(source, /dso\.availability_expires_at>now\(\)/);
});

test("general storefront surfaces newly published Symphonya families before the hourly read-model refresh", () => {
  const source = readFileSync(new URL("../src/lib/storefront-read-model.ts", import.meta.url), "utf8");
  assert.match(source, /hot_symphonya AS MATERIALIZED/);
  assert.match(source, /ds\.code='symphonya'/);
  assert.match(source, /NOT EXISTS \([\s\S]*stable projected/);
  assert.match(source, /vo\.status='approved'/);
  assert.match(source, /vo\.merchant_visible=true/);
  assert.match(source, /dso\.availability_expires_at>now\(\)/);
  assert.match(source, /bls_private\.vendor_category_effectively_visible/);
});


test("Symphonya stock persistence uses the indexed supplier product id without an EAN OR fallback", () => {
  const runtime = readFileSync(new URL("../src/lib/symphonya-stock-sync-runtime.ts", import.meta.url), "utf8");
  assert.match(runtime, /dso\.supplier_id=supplier\.id AND dso\.external_product_id=stock\.external_product_id/);
  assert.doesNotMatch(runtime, /dso\.external_product_id=stock\.external_product_id OR/);
});

test("Symphonya stock cron alternates full-cursor and priority supplier workloads", () => {
  const route = readFileSync(new URL("../src/app/api/cron/symphonya-stock/route.ts", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../src/lib/symphonya-stock-sync-runtime.ts", import.meta.url), "utf8");
  assert.match(route, /PRIORITY_REFRESH_WINDOW_MINUTES/);
  assert.match(route, /FULL_CURSOR_BUDGET_MS = 28_000/);
  assert.match(route, /PRIORITY_BATCH_LIMIT = 200/);
  assert.match(route, /defaultCronStockMode/);
  assert.match(route, /executionMode === "cursor"/);
  assert.match(route, /if \(executionMode === "priority"\)/);
  assert.match(route, /maxDurationMs: FULL_CURSOR_BUDGET_MS/);
  assert.match(route, /priorityIds = \[\.\.\.new Set\(\[\.\.\.publishedIds, \.\.\.publicationCandidateIds\]\)\]/);
  assert.equal((route.match(/refreshSymphonyaOfferStockByExternalIds\(priorityIds\)/g) ?? []).length, 1);
  assert.match(route, /publication = await runSymphonyaAutoPublicationSweep\(\)/);
  assert.match(runtime, /const SLICE_MS = 28_000/);
  assert.match(runtime, /pageStartSafetyMs = timeoutMs\(\)\+6_000/);
  assert.match(runtime, /pages < pageLimit/);
});
