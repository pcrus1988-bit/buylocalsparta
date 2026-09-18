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
  assert.match(source, /pt\.locale IN \('el','en'\)/);
});

test("API-authoritative checkout live-revalidates Symphonya stock and buying cost", () => {
  const source = readFileSync(new URL("../src/lib/dropship-checkout-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /SYMPHONYA_SUPPLIER_CODE = "symphonya"/);
  assert.match(source, /new SymphonyaHttpTransport/);
  assert.match(source, /getStock\(\{ productIds: \[row\.external_product_id\] \}\)/);
  assert.match(source, /stock\.wholesaleCostMinor/);
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

test("Symphonya isolated materialization cron is scheduled without enabling ordering", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const catalogue = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-catalogue");
  const materialization = config.crons.find((entry: { path: string }) => entry.path === "/api/cron/symphonya-materialization");
  assert.equal(catalogue?.schedule, "* * * * *");
  assert.equal(materialization?.schedule, "* * * * *");
});
