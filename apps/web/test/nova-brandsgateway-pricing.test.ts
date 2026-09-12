import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNovaBrandsGatewayRecommendation,
  isNovaBrandsGatewaySupplier,
  novaBrandsGatewayCategoryShippingMinor,
  novaBrandsGatewayShippingClass
} from "../src/lib/nova-brandsgateway-pricing.ts";

test("recognises NOVA / BrandsGateway supplier identities", () => {
  assert.equal(isNovaBrandsGatewaySupplier({ code: "NOVA", displayName: "Nova", providerKind: "dropship" }), true);
  assert.equal(isNovaBrandsGatewaySupplier({ code: "bg-eu", displayName: "BrandsGateway EU", providerKind: "api" }), true);
  assert.equal(isNovaBrandsGatewaySupplier({ code: "other", displayName: "Other Supplier", providerKind: "api" }), false);
});

test("maps BrandsGateway category shipping fees conservatively", () => {
  assert.equal(novaBrandsGatewayShippingClass("Accessories", "Bags & Wallets"), "bags_wallets");
  assert.equal(novaBrandsGatewayCategoryShippingMinor("Accessories", "Bags & Wallets"), 400);
  assert.equal(novaBrandsGatewayCategoryShippingMinor("Clothing", "T-Shirts"), 200);
  assert.equal(novaBrandsGatewayCategoryShippingMinor("Shoes", null), 400);
  assert.equal(novaBrandsGatewayCategoryShippingMinor("Unknown category", null), 400);
});

test("allocates only a basket share of the Greece base shipping fee", () => {
  const recommendation = calculateNovaBrandsGatewayRecommendation({
    supplierCostMinor: 900,
    msrpMinor: 4100,
    category: "Clothing",
    subcategory: "T-Shirts"
  });

  assert.equal(recommendation.categoryShippingMinor, 200);
  assert.equal(recommendation.targetShippingMinor, 700);
  assert.equal(recommendation.embeddedShippingMinor, 700);
  assert.equal(recommendation.recommendedSellingPriceMinor, 2561);
  assert.equal(recommendation.recommendedMarkupPercent, 184.56);
  assert.equal(recommendation.recommendedProfitMinor, 414);
  assert.equal(recommendation.shippingStatus, "basket_safe");
});

test("caps shipping absorption for a low-MSRP product instead of adding the full shipment", () => {
  const recommendation = calculateNovaBrandsGatewayRecommendation({
    supplierCostMinor: 800,
    msrpMinor: 2000,
    category: "Clothing"
  });

  assert.equal(recommendation.targetShippingMinor, 700);
  assert.equal(recommendation.maximumAbsorbableShippingMinor, 450);
  assert.equal(recommendation.embeddedShippingMinor, 450);
  assert.equal(recommendation.recommendedSellingPriceMinor, 2000);
  assert.equal(recommendation.recommendedMarkupPercent, 150);
  assert.equal(recommendation.shippingStatus, "basket_dependent");
});

test("allows a high-value item to carry the complete Greece Economy shipment", () => {
  const recommendation = calculateNovaBrandsGatewayRecommendation({
    supplierCostMinor: 15600,
    msrpMinor: 39500,
    category: "Accessories",
    subcategory: "Bags"
  });

  assert.equal(recommendation.categoryShippingMinor, 400);
  assert.equal(recommendation.targetShippingMinor, 1900);
  assert.equal(recommendation.embeddedShippingMinor, 1900);
  assert.equal(recommendation.shippingStatus, "standalone_safe");
});
