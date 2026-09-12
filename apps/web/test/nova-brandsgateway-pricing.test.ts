import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNovaBrandsGatewayRecommendation,
  isNovaBrandsGatewaySupplier,
  novaBrandsGatewayCategoryShippingMinor,
  novaBrandsGatewayShippingClass,
  roundNovaBrandsGatewaySellingPriceMinor
} from "../src/lib/nova-brandsgateway-pricing.ts";
import { novaBrandsGatewaySourceCategoryPath } from "../src/lib/nova-brandsgateway-source-category.ts";

test("recognises NOVA / BrandsGateway supplier identities", () => {
  assert.equal(isNovaBrandsGatewaySupplier({ code: "NOVA", displayName: "Nova", providerKind: "dropship" }), true);
  assert.equal(isNovaBrandsGatewaySupplier({ code: "bg-eu", displayName: "BrandsGateway EU", providerKind: "api" }), true);
  assert.equal(isNovaBrandsGatewaySupplier({ code: "other", displayName: "Other Supplier", providerKind: "api" }), false);
});

test("reads exact human NOVA API category labels without leaking numeric ids", () => {
  const path = novaBrandsGatewaySourceCategoryPath(
    [{ id: 12, name: "Accessories" }, { id: 44, name: "Bags & Wallets" }],
    [12, 44]
  );
  assert.equal(path, "Accessories › Bags & Wallets");
  assert.equal(novaBrandsGatewayShippingClass(path, null), "bags_wallets");
  assert.equal(novaBrandsGatewaySourceCategoryPath([], [{ id: 8, slug: "shoes" }]), "shoes");
  assert.equal(novaBrandsGatewaySourceCategoryPath([], [12, 44]), null);
});

test("maps BrandsGateway category shipping fees conservatively", () => {
  assert.equal(novaBrandsGatewayShippingClass("Accessories", "Bags & Wallets"), "bags_wallets");
  assert.equal(novaBrandsGatewayCategoryShippingMinor("Accessories", "Bags & Wallets"), 400);
  assert.equal(novaBrandsGatewayCategoryShippingMinor("Clothing", "T-Shirts"), 200);
  assert.equal(novaBrandsGatewayCategoryShippingMinor("Shoes", null), 400);
  assert.equal(novaBrandsGatewayCategoryShippingMinor("Unknown category", null), 400);
});

test("rounds selling prices to the requested 4.90 / 9.90 ladder", () => {
  assert.equal(roundNovaBrandsGatewaySellingPriceMinor(2_000), 2_490);
  assert.equal(roundNovaBrandsGatewaySellingPriceMinor(2_490), 2_490);
  assert.equal(roundNovaBrandsGatewaySellingPriceMinor(2_491), 2_990);
  assert.equal(roundNovaBrandsGatewaySellingPriceMinor(2_990), 2_990);
  assert.equal(roundNovaBrandsGatewaySellingPriceMinor(2_999), 2_990);
  assert.equal(roundNovaBrandsGatewaySellingPriceMinor(3_001), 3_490);
});

test("allocates basket shipping then rounds every indicator from the final price", () => {
  const recommendation = calculateNovaBrandsGatewayRecommendation({
    supplierCostMinor: 900,
    msrpMinor: 4100,
    category: "Clothing",
    subcategory: "T-Shirts"
  });
  assert.equal(recommendation.categoryShippingMinor, 200);
  assert.equal(recommendation.targetShippingMinor, 700);
  assert.equal(recommendation.embeddedShippingMinor, 700);
  assert.equal(recommendation.unroundedSellingPriceMinor, 2560);
  assert.equal(recommendation.recommendedSellingPriceMinor, 2990);
  assert.equal(recommendation.recommendedMarkupPercent, 232.22);
  assert.equal(recommendation.recommendedProfitMinor, 751);
  assert.equal(recommendation.recommendedProfitPercent, 31.15);
  assert.equal(recommendation.overpriced, false);
  assert.equal(recommendation.shippingStatus, "basket_safe");
});

test("flags a rounded selling price above MSRP without capping it", () => {
  const recommendation = calculateNovaBrandsGatewayRecommendation({
    supplierCostMinor: 800,
    msrpMinor: 2000,
    category: "Clothing"
  });
  assert.equal(recommendation.unroundedSellingPriceMinor, 2400);
  assert.equal(recommendation.recommendedSellingPriceMinor, 2490);
  assert.equal(recommendation.recommendedMarkupPercent, 211.25);
  assert.equal(recommendation.overpriced, true);
  assert.equal(recommendation.overpricedByMinor, 490);
  assert.equal(recommendation.overpricedByPercent, 24.5);
  assert.equal(recommendation.cappedAtMsrp, false);
});

test("allows a high-value item to carry the complete Economy shipment and rounds it", () => {
  const recommendation = calculateNovaBrandsGatewayRecommendation({
    supplierCostMinor: 15600,
    msrpMinor: 39500,
    category: "Accessories",
    subcategory: "Bags"
  });
  assert.equal(recommendation.categoryShippingMinor, 400);
  assert.equal(recommendation.targetShippingMinor, 1900);
  assert.equal(recommendation.embeddedShippingMinor, 1900);
  assert.equal(recommendation.unroundedSellingPriceMinor, 28000);
  assert.equal(recommendation.recommendedSellingPriceMinor, 28490);
  assert.equal(recommendation.shippingStatus, "standalone_safe");
  assert.equal(recommendation.overpriced, false);
});
