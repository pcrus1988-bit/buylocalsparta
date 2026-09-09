import assert from "node:assert/strict";
import {
  calculateFirstYearAnnualPlanPartnerPayoutCents,
  calculateNonCumulativeMonthlyBonusCents,
  calculatePartnerCommissionCents,
  calculatePlatformCommissionRevenueCents,
  normalizePartnerCode
} from "../apps/web/src/lib/partner-network.ts";

assert.equal(calculatePartnerCommissionCents({ eventType: "ACTIVATION", baseAmountCents: 49_900, level: 1 }), 14_970);
assert.equal(calculatePartnerCommissionCents({ eventType: "ACTIVATION", baseAmountCents: 49_900, level: 2 }), 3_493);
assert.equal(calculatePartnerCommissionCents({ eventType: "ACTIVATION", baseAmountCents: 49_900, level: 3 }), 1_497);

assert.equal(calculatePartnerCommissionCents({ eventType: "SUBSCRIPTION", baseAmountCents: 99_000, level: 1 }), 17_820);
assert.equal(calculatePartnerCommissionCents({ eventType: "SUBSCRIPTION", baseAmountCents: 99_000, level: 2 }), 4_950);
assert.equal(calculatePartnerCommissionCents({ eventType: "SUBSCRIPTION", baseAmountCents: 99_000, level: 3 }), 1_980);

const shopPlatformRevenue = calculatePlatformCommissionRevenueCents({ grossMerchandiseValueCents: 1_000_000, planCode: "SHOP" });
assert.equal(shopPlatformRevenue, 80_000);
assert.equal(calculatePartnerCommissionCents({ eventType: "PLATFORM_COMMISSION", baseAmountCents: shopPlatformRevenue, level: 1 }), 4_000);
assert.equal(calculatePartnerCommissionCents({ eventType: "PLATFORM_COMMISSION", baseAmountCents: shopPlatformRevenue, level: 2 }), 1_200);
assert.equal(calculatePartnerCommissionCents({ eventType: "PLATFORM_COMMISSION", baseAmountCents: shopPlatformRevenue, level: 3 }), 400);

assert.equal(calculateFirstYearAnnualPlanPartnerPayoutCents("CLAIM", 1), 0);
assert.equal(calculateNonCumulativeMonthlyBonusCents(4), 0);
assert.equal(calculateNonCumulativeMonthlyBonusCents(5), 5_000);
assert.equal(calculateNonCumulativeMonthlyBonusCents(10), 15_000);
assert.equal(calculateNonCumulativeMonthlyBonusCents(99), 100_000);
assert.equal(calculateNonCumulativeMonthlyBonusCents(100), 250_000);

assert.equal(normalizePartnerCode(" km_sparta01 "), "KM_SPARTA01");
assert.equal(normalizePartnerCode("bad code"), null);

console.log("Partner Network financial invariants verified.");
