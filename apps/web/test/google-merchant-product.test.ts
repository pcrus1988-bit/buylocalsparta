import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleMerchantProductInput,
  googleMerchantProductInputSegment,
  validGtin
} from "../src/lib/google-merchant-product.ts";

test("builds a Greek Merchant product from the governed catalogue projection", () => {
  const input = buildGoogleMerchantProductInput({
    canonicalPublicId: "product_12345678",
    slug: "luxury-bag",
    title: "Luxury Bag",
    description: "A premium bag",
    gtin: "4006381333931",
    mpn: "ABC-123",
    brand: "Example Brand",
    color: "Black",
    condition: "new",
    priceMinor: 12345
  }, "https://supplier.example/images/bag.jpg", "https://kontamou.site");

  assert.equal(input.offerId, "product_12345678");
  assert.equal(input.contentLanguage, "el");
  assert.equal(input.feedLabel, "GR");
  assert.equal(input.productAttributes.link, "https://kontamou.site/product/luxury-bag");
  assert.equal(input.productAttributes.imageLink, "https://supplier.example/images/bag.jpg");
  assert.equal(input.productAttributes.availability, "IN_STOCK");
  assert.equal(input.productAttributes.price.amountMicros, "123450000");
  assert.equal(input.productAttributes.price.currencyCode, "EUR");
  assert.equal(input.productAttributes.condition, "NEW");
  assert.deepEqual(input.productAttributes.gtins, ["4006381333931"]);
});

test("drops a syntactically plausible GTIN with the wrong GS1 check digit", () => {
  assert.equal(validGtin("4006381333931"), "4006381333931");
  assert.equal(validGtin("4006381333932"), undefined);
  const input = buildGoogleMerchantProductInput({
    canonicalPublicId: "product_badgtin",
    slug: "test",
    title: "Test product",
    gtin: "4006381333932",
    priceMinor: "999"
  }, "https://supplier.example/image.jpg");
  assert.equal(input.productAttributes.gtins, undefined);
});

test("uses an unpadded base64url resource segment for safe deletes", () => {
  const segment = googleMerchantProductInputSegment("el", "GR", "sku/with:reserved~chars");
  assert.equal(segment.includes("/"), false);
  assert.equal(segment.includes("="), false);
  assert.equal(Buffer.from(segment, "base64url").toString("utf8"), "el~GR~sku/with:reserved~chars");
});

test("rejects invalid price and non-HTTPS image data before Merchant submission", () => {
  assert.throws(() => buildGoogleMerchantProductInput({
    canonicalPublicId: "product_invalid",
    slug: "invalid",
    title: "Invalid",
    priceMinor: 0
  }, "https://supplier.example/image.jpg"), /price must be positive/i);

  assert.throws(() => buildGoogleMerchantProductInput({
    canonicalPublicId: "product_invalid",
    slug: "invalid",
    title: "Invalid",
    priceMinor: 100
  }, "http://supplier.example/image.jpg"), /image must use HTTPS/i);
});


test("supports an English fallback feed for Greece without changing the target feed label", () => {
  const input = buildGoogleMerchantProductInput({
    canonicalPublicId: "product_en_123456",
    slug: "english-product",
    title: "Black Cotton T-Shirt",
    description: "Black cotton T-shirt.",
    brand: "Example Brand",
    condition: "new",
    priceMinor: 4999,
    contentLanguage: "en"
  }, "https://supplier.example/images/shirt.jpg", "https://kontamou.site");

  assert.equal(input.contentLanguage, "en");
  assert.equal(input.feedLabel, "GR");
  assert.equal(input.productAttributes.title, "Black Cotton T-Shirt");
});
