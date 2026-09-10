import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNovaProduct, novaAvailability, novaMoneyMinor } from "../../../integrations/dropship-suppliers/src/nova-normalize.ts";

test("Nova normalization maps regular_price to MSRP and sale_price to buying cost", () => {
  const evidence = normalizeNovaProduct({
    id: 111,
    name: "Example bag",
    sku: "BG-111",
    barcode: "1234567890123",
    mpn: "MPN-111",
    regular_price: 2100,
    sale_price: 1300,
    manage_stock: true,
    in_stock: true,
    stock_status: "instock",
    stock_quantity: 4,
    brand: { id: 7, name: "Example Brand" },
    vendor: { id: 9, name: "Warehouse Vendor" },
    images: [{ src: "https://example.test/image.jpg", position: 0 }],
    variations: []
  }, 2);

  assert.equal(evidence.sourceProductKey, "111");
  assert.equal(evidence.supplierCode, "BG-111");
  assert.equal(evidence.sourceIdentity.gtinCandidate, "1234567890123");
  assert.equal(evidence.sourceIdentity.mpn, "MPN-111");
  assert.equal(evidence.priceState, "review_required");
  assert.equal(evidence.qualityPayload.publicEligible, false);
  assert.equal(evidence.qualityPayload.pricingSemanticsVerified, true);
  assert.equal(evidence.qualityPayload.priceReviewRequired, false);
  assert.equal(evidence.qualityPayload.retailPriceRequired, true);
  assert.equal(evidence.qualityPayload.syntheticProductLevelVariant, true);

  const payload = evidence.normalizedPayload as Record<string, unknown>;
  const prices = payload.prices as Record<string, unknown>;
  assert.equal(prices.regularPriceRaw, 2100);
  assert.equal(prices.salePriceRaw, 1300);
  assert.equal(prices.msrpRaw, 2100);
  assert.equal(prices.buyingCostRaw, 1300);
  assert.equal(prices.msrpMinor, 210000);
  assert.equal(prices.buyingCostMinor, 130000);
  assert.equal(prices.regularPriceMeaning, "msrp");
  assert.equal(prices.salePriceMeaning, "buying_cost");
  assert.equal(prices.customerSellingPriceSource, "konta_mou_structured_pricing");

  const variants = payload.variants as Array<Record<string, unknown>>;
  assert.equal(variants[0]?.externalVariantId, "111");
  assert.equal(variants[0]?.available, true);
  assert.equal(variants[0]?.msrpMinor, 210000);
  assert.equal(variants[0]?.buyingCostMinor, 130000);
});

test("Nova money conversion treats API price values as EUR major units", () => {
  assert.equal(novaMoneyMinor(2100), 210000);
  assert.equal(novaMoneyMinor("49.95"), 4995);
  assert.equal(novaMoneyMinor("0"), 0);
  assert.equal(novaMoneyMinor(-1), null);
  assert.equal(novaMoneyMinor("not-money"), null);
});

test("Nova normalization makes supplier backorders unavailable", () => {
  assert.equal(novaAvailability({ manage_stock: true, in_stock: true, stock_status: "onbackorder", stock_quantity: 12 }), false);
  assert.equal(novaAvailability({ manage_stock: true, in_stock: true, stock_status: "instock", stock_quantity: 1 }, 2), false);
  assert.equal(novaAvailability({ manage_stock: false, in_stock: true, stock_status: "instock" }, 3), true);
  assert.equal(novaAvailability({ manage_stock: true, in_stock: true, stock_status: "instock", stock_quantity: 4 }, 4), true);
});

test("Nova variations keep external IDs and price semantics first class", () => {
  const evidence = normalizeNovaProduct({
    id: "p-1",
    name: "Variation product",
    sku: "PARENT",
    variations: [
      {
        id: "v-42",
        sku: "SIZE-42",
        barcode: "4000000000042",
        mpn: "M-42",
        regular_price: "399.90",
        sale_price: "221.25",
        manage_stock: true,
        in_stock: true,
        stock_status: "instock",
        stock_quantity: 2
      }
    ]
  }, 2);
  const payload = evidence.normalizedPayload as Record<string, unknown>;
  const variants = payload.variants as Array<Record<string, unknown>>;
  assert.equal(variants.length, 1);
  assert.equal(variants[0]?.externalVariantId, "v-42");
  assert.equal(variants[0]?.sku, "SIZE-42");
  assert.equal(variants[0]?.msrpMinor, 39990);
  assert.equal(variants[0]?.buyingCostMinor, 22125);
  assert.equal(evidence.qualityPayload.syntheticProductLevelVariant, false);
});

test("Nova normalization flags impossible MSRP below buying cost without publishing", () => {
  const evidence = normalizeNovaProduct({ id: 8, name: "Bad price", regular_price: 100, sale_price: 120 }, 2);
  assert.equal(evidence.qualityPayload.pricingIntegrityIssue, "msrp_below_buying_cost");
  assert.equal(evidence.qualityPayload.publicEligible, false);
});
