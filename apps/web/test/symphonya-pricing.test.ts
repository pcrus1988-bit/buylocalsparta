import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSymphonyaRetailPrice,
  symphonyaPricingConfig
} from "../src/lib/symphonya-pricing.ts";

test("Symphonya pricing rejects missing or zero supplier cost", () => {
  assert.equal(calculateSymphonyaRetailPrice(null).sellingPriceMinor, null);
  assert.equal(calculateSymphonyaRetailPrice(0).sellingPriceMinor, null);
});

test("Symphonya pricing covers percentage and minimum contribution floors", () => {
  const low = calculateSymphonyaRetailPrice(500, {
    markupRate: 0.35,
    minimumProfitMinor: 490,
    transactionRate: 0.025
  });
  assert.ok((low.sellingPriceMinor ?? 0) >= 1020);
  assert.ok((low.profitMinor ?? 0) >= 490);

  const high = calculateSymphonyaRetailPrice(10_000, {
    markupRate: 0.35,
    minimumProfitMinor: 490,
    transactionRate: 0.025
  });
  assert.ok((high.sellingPriceMinor ?? 0) >= 13_500);
  assert.ok((high.markupPercent ?? 0) >= 35);
});

test("Symphonya pricing configuration accepts safe environment overrides only", () => {
  const config = symphonyaPricingConfig({
    BLS_SYMPHONYA_MARKUP_RATE: "0.4",
    BLS_SYMPHONYA_MINIMUM_PROFIT_MINOR: "600",
    BLS_SYMPHONYA_TRANSACTION_RATE: "0.03"
  } as NodeJS.ProcessEnv);
  assert.equal(config.markupRate, 0.4);
  assert.equal(config.minimumProfitMinor, 600);
  assert.equal(config.transactionRate, 0.03);
});
