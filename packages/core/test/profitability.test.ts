import assert from "node:assert/strict";
import test from "node:test";
import { calculateCurrentCatalogueMargin, calculateProfitabilityLine } from "../src/finance/profitability.ts";

test("realized profitability uses captured buying cost and marketplace proceeds separately", () => {
  const result = calculateProfitabilityLine({
    orderedQuantity: 2,
    fulfilledQuantity: 2,
    refundedQuantity: 0,
    retailUnitPriceMinor: 2_000,
    vendorProceedsMinor: 3_800,
    buyingUnitPriceMinor: 1_200
  });
  assert.equal(result.realizedRevenueMinor, 4_000);
  assert.equal(result.realizedVendorProceedsMinor, 3_800);
  assert.equal(result.realizedCostMinor, 2_400);
  assert.equal(result.grossProfitMinor, 1_600);
  assert.equal(result.contributionAfterMarketplaceFeesMinor, 1_400);
  assert.equal(result.grossMarginBps, 4_000);
  assert.equal(result.contributionMarginBps, 3_500);
});

test("returns reduce recognized quantity and preserve historical unit cost", () => {
  const result = calculateProfitabilityLine({
    orderedQuantity: 3,
    fulfilledQuantity: 3,
    refundedQuantity: 1,
    retailUnitPriceMinor: 1_500,
    vendorProceedsMinor: 4_275,
    buyingUnitPriceMinor: 900
  });
  assert.equal(result.recognizedQuantity, 2);
  assert.equal(result.realizedRevenueMinor, 3_000);
  assert.equal(result.realizedVendorProceedsMinor, 2_850);
  assert.equal(result.realizedCostMinor, 1_800);
  assert.equal(result.grossProfitMinor, 1_200);
  assert.equal(result.contributionAfterMarketplaceFeesMinor, 1_050);
});

test("legacy lines without a cost snapshot never invent profitability", () => {
  const result = calculateProfitabilityLine({
    orderedQuantity: 1,
    fulfilledQuantity: 1,
    refundedQuantity: 0,
    retailUnitPriceMinor: 5_000,
    vendorProceedsMinor: 4_650
  });
  assert.equal(result.costCovered, false);
  assert.equal(result.realizedRevenueMinor, 5_000);
  assert.equal(result.realizedCostMinor, undefined);
  assert.equal(result.grossProfitMinor, undefined);
  assert.equal(result.contributionAfterMarketplaceFeesMinor, undefined);
});

test("line-level adjustment refunds reduce realized revenue and proceeds", () => {
  const result = calculateProfitabilityLine({
    orderedQuantity: 1,
    fulfilledQuantity: 1,
    refundedQuantity: 0,
    retailUnitPriceMinor: 5_000,
    vendorProceedsMinor: 4_700,
    buyingUnitPriceMinor: 3_000,
    adjustmentRefundedMinor: 500
  });
  assert.equal(result.realizedRevenueMinor, 4_500);
  assert.equal(result.realizedVendorProceedsMinor, 4_200);
  assert.equal(result.realizedCostMinor, 3_000);
  assert.equal(result.grossProfitMinor, 1_500);
  assert.equal(result.contributionAfterMarketplaceFeesMinor, 1_200);
});

test("current catalogue margin flags missing, negative, thin and healthy cost structures", () => {
  assert.equal(calculateCurrentCatalogueMargin({ retailPriceMinor: 1_000 }).status, "missing_cost");
  assert.equal(calculateCurrentCatalogueMargin({ retailPriceMinor: 1_000, buyingPriceMinor: 1_100 }).status, "negative");
  assert.equal(calculateCurrentCatalogueMargin({ retailPriceMinor: 1_000, buyingPriceMinor: 900 }).status, "thin");
  assert.equal(calculateCurrentCatalogueMargin({ retailPriceMinor: 1_000, buyingPriceMinor: 700 }).status, "healthy");
});

test("vendor-funded discount impact is prorated to recognized quantity", () => {
  const result = calculateProfitabilityLine({
    orderedQuantity: 4,
    fulfilledQuantity: 4,
    refundedQuantity: 2,
    retailUnitPriceMinor: 1_000,
    vendorProceedsMinor: 3_600,
    buyingUnitPriceMinor: 500,
    vendorDiscountMinor: 400,
    couponVendorFundingMinor: 200
  });
  assert.equal(result.vendorFundedDiscountMinor, 300);
});
