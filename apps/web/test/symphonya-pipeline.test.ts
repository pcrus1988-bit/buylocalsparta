import assert from "node:assert/strict";
import test from "node:test";
import { symphonyaAutoPricingEnabled } from "../src/lib/symphonya-auto-pricing-runtime.ts";
import { resolveSymphonyaCategoryCode } from "../src/lib/symphonya-auto-publication-runtime.ts";
import { normalizeSymphonyaGlobalIdentifier } from "../src/lib/symphonya-catalogue-materializer.ts";

test("Symphonya automatic pricing is on by default but can be explicitly disabled", () => {
  assert.equal(symphonyaAutoPricingEnabled({} as NodeJS.ProcessEnv), true);
  assert.equal(symphonyaAutoPricingEnabled({ BLS_SYMPHONYA_AUTO_PRICING_ENABLED: "false" } as NodeJS.ProcessEnv), false);
  assert.equal(symphonyaAutoPricingEnabled({ BLS_SYMPHONYA_AUTO_PRICING_ENABLED: "TRUE" } as NodeJS.ProcessEnv), true);
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
