import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { symphonyaAutoPricingEnabled } from "../src/lib/symphonya-auto-pricing-runtime.ts";
import { symphonyaAutoPublicationEnabled } from "../src/lib/symphonya-auto-publication-runtime.ts";
import { resolveSymphonyaCategoryCode } from "../src/lib/symphonya-category-mapping.ts";
import { normalizeSymphonyaGlobalIdentifier } from "../src/lib/symphonya-catalogue-materializer.ts";
import { categoryCodeMatches, storefrontLeafForSubcategory } from "../src/lib/storefront-taxonomy.ts";

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
  assert.match(source, /pt\.locale IN \('el','en'\)/);
  assert.match(source, /vo\.status::text IN \('draft','approved','archived'\)/);
  assert.match(source, /vendor_product_submissions/);
  assert.match(source, /vendor_product_activation_requests ar/);
});

test("Symphonya deterministic Greek fallback is promoted before AI and does not require enriched status", () => {
  const enrichment = readFileSync(new URL("../src/lib/symphonya-enrichment-runtime.ts", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("../src/app/api/cron/symphonya-pipeline/route.ts", import.meta.url), "utf8");
  assert.match(enrichment, /runSymphonyaDeterministicTranslationPromotionSlice/);
  assert.match(enrichment, /ce\.deterministic_fallback->>'titleEl'/);
  assert.match(enrichment, /INSERT INTO public\.product_translations/);
  assert.doesNotMatch(enrichment, /ce\.status='enriched'[\s\S]*deterministic_fallback/);
  const preparation = pipeline.indexOf("runSymphonyaEnrichmentPreparationSlice");
  const fallback = pipeline.indexOf("runSymphonyaDeterministicTranslationPromotionSlice", preparation);
  const aiPromotion = pipeline.indexOf("runCatalogueEnrichmentPromotionSlice", fallback);
  const publication = pipeline.indexOf("runSymphonyaAutoPublicationSweep", aiPromotion);
  assert.ok(preparation >= 0 && fallback > preparation && aiPromotion > fallback && publication > aiPromotion);
});

test("validated AI Greek may upgrade only a still-unpublished deterministic fallback", () => {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20260919085000_symphonya_deterministic_greek_fallback_upgrade.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /v_fallback_title/);
  assert.match(migration, /e\.published_at IS NULL/);
  assert.match(migration, /btrim\(public\.product_translations\.title\)=v_fallback_title/);
  assert.match(migration, /ELSE public\.product_translations\.title/);
});

test("Symphonya publication batch excludes already-converged rows before LIMIT", () => {
  const source = readFileSync(new URL("../src/lib/symphonya-auto-publication-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /JOIN public\.product_families pf ON pf\.id=cv\.family_id/);
  assert.match(source, /pf\.active=false/);
  assert.match(source, /COALESCE\(vo\.source_payload->>'publicationState',''\)<>'PUBLISHED'/);
  assert.match(source, /COALESCE\(vo\.source_payload->>'publishedBy',''\)<>'symphonya_auto_publication'/);
  assert.match(source, /[\s\S]*publicationState[\s\S]*ORDER BY vo\.id[\s\S]*LIMIT \$2/);
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
  assert.match(preparation, /FROM public\.catalog_source_products p/);
  assert.match(preparation, /ORDER BY p\.created_at DESC,p\.id DESC/);
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

test("Symphonya secondary structured branches use existing governed product classes", () => {
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Room Scents", scat: "Air Fresheners", sscat: "Room Air Freshener" } }), "candles-home-fragrance");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Makeup", scat: "Tools & Accessories", sscat: "Eyelash Curler" } }), "beauty-tools-accessories");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Hair", scat: "Beard Grooming", sscat: "Beard Oil" } }), "grooming-care");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Fashion", scat: "Fashion Accessories", sscat: "Sunglasses" } }), "sunglasses");
  assert.equal(resolveSymphonyaCategoryCode({
    categoryDetails: { cat: "Fashion", scat: "Bags & Backpacks", sscat: "Textile Bag" },
    gender: { name: "female" }
  }), "handbags");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Home", scat: "Kitchen", sscat: "Crystal Glass" } }), "tableware-glassware");
  assert.equal(resolveSymphonyaCategoryCode({ categoryDetails: { cat: "Toys", scat: "Creative Toys", sscat: "Construction Set" } }), "construction-toys");
});

test("storefront Beauty taxonomy recognizes canonical Symphonya branches and leaf filters", () => {
  assert.equal(categoryCodeMatches("face-makeup", "beauty", "beauty-health-retail"), true);
  assert.equal(categoryCodeMatches("fragrance", "beauty", "beauty-health-retail"), true);
  assert.equal(categoryCodeMatches("hair-treatments", "beauty", "beauty-health-retail"), true);
  assert.equal(storefrontLeafForSubcategory("beauty", "face-makeup")?.key, "makeup");
  assert.equal(storefrontLeafForSubcategory("beauty", "fragrance")?.key, "fragrance");
  assert.equal(storefrontLeafForSubcategory("beauty", "hair-treatments")?.key, "haircare");
});

test("shop taxonomy facets overlay fresh Symphonya stock instead of waiting for materialized views", () => {
  const fast = readFileSync(new URL("../src/lib/fast-shop-taxonomy.ts", import.meta.url), "utf8");
  const rich = readFileSync(new URL("../src/lib/fast-rich-shop-taxonomy.ts", import.meta.url), "utf8");
  const navigation = readFileSync(new URL("../src/lib/available-catalog-taxonomy.ts", import.meta.url), "utf8");

  for (const source of [fast, rich, navigation]) {
    assert.match(source, /ds\.code='symphonya'/);
    assert.match(source, /dso\.cached_available=true/);
    assert.match(source, /dso\.availability_expires_at>now\(\)/);
    assert.match(source, /bls_private\.vendor_category_effectively_visible/);
  }
  assert.match(fast, /hot_symphonya AS MATERIALIZED/);
  assert.match(rich, /hot_symphonya AS MATERIALIZED/);
  assert.match(rich, /cv\.variant_attributes/);
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

test("Symphonya Vercel stock cron completes full freshness cycles inside the TTL", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const catalogue = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-catalogue");
  const stock = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-stock");
  const pipeline = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-pipeline");
  const materialization = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-materialization");
  assert.equal(catalogue?.schedule, "2 * * * *");
  assert.equal(stock?.schedule, "*/5 * * * *");
  assert.equal(pipeline?.schedule, "28 * * * *");
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

test("Symphonya stock cron uses concurrent cursor bursts while retaining manual priority recovery", () => {
  const route = readFileSync(new URL("../src/app/api/cron/symphonya-stock/route.ts", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../src/lib/symphonya-stock-sync-runtime.ts", import.meta.url), "utf8");
  assert.match(route, /PRIORITY_REFRESH_WINDOW_MINUTES/);
  assert.match(route, /FULL_CURSOR_MAX_PAGES = 8/);
  assert.match(route, /PRIORITY_BATCH_LIMIT = 200/);
  assert.match(route, /runSymphonyaStockSyncBurst\(FULL_CURSOR_MAX_PAGES\)/);
  assert.match(route, /executionMode === "cursor"/);
  assert.match(route, /if \(executionMode === "priority"\)/);
  assert.doesNotMatch(route, /defaultCronStockMode/);
  assert.match(route, /priorityIds = \[\.\.\.new Set\(\[\.\.\.publishedIds, \.\.\.publicationCandidateIds\]\)\]/);
  assert.equal((route.match(/refreshSymphonyaOfferStockByExternalIds\(priorityIds\)/g) ?? []).length, 1);
  assert.match(route, /publication = await runSymphonyaAutoPublicationSweep\(\)/);
  assert.match(runtime, /runSymphonyaStockSyncBurst/);
  assert.match(runtime, /Promise\.all\(/);
  assert.match(runtime, /Math\\.min\\(8, positiveIntegerValue\\(requestedMaxPages, 8\\)\\)/);
});
