import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const migration = readFileSync("db/migrations/0215_partner_network_foundation.sql", "utf8");
for (const boundary of [
  "recruitment_commission_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (recruitment_commission_enabled = FALSE)",
  "source_type IN ('ACTIVATION','SUBSCRIPTION','PLATFORM_COMMISSION','DIRECT_RENEWAL','PERFORMANCE_BONUS','ADJUSTMENT','CLAWBACK')",
  "partner commission events are append-only; use a clawback event",
  "WITH (security_invoker = true)",
  "ENABLE ROW LEVEL SECURITY",
  "FROM PUBLIC, anon, authenticated, bls_app_runtime, bls_platform_runtime",
  "TO bls_app_runtime",
  "TO bls_platform_runtime",
  "client Data API roles must not access Partner Network data",
  "PLATFORM_COMMISSION base_amount_cents is KONTA MOY platform fee revenue, never vendor GMV"
]) {
  assert.ok(migration.includes(boundary), `Partner Network migration is missing safety boundary: ${boundary}`);
}
assert.ok(!migration.includes("'RECRUITMENT'"), "Recruitment must never be a commission source type");

console.log("Partner Network financial, anti-recruitment and database-access invariants verified.");
