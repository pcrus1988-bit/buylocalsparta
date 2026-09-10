import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PARTNER_ATTRIBUTION_DAYS,
  PARTNER_MAX_LEVELS,
  calculateFirstYearAnnualPlanPartnerPayoutCents,
  calculateNonCumulativeMonthlyBonusCents,
  calculatePartnerCommissionCents,
  calculatePlatformCommissionRevenueCents,
  normalizePartnerCode
} from "../../../apps/web/src/lib/partner-network.ts";
import { isReservedHubRouteSegment } from "../../../apps/web/src/lib/hub-resolver.ts";

test("Partner Network economics remain sales-derived and capped at three levels", () => {
  assert.equal(PARTNER_MAX_LEVELS, 3);
  assert.equal(PARTNER_ATTRIBUTION_DAYS, 180);
  assert.equal(calculatePartnerCommissionCents({ eventType: "ACTIVATION", baseAmountCents: 49_900, level: 1 }), 14_970);
  assert.equal(calculatePartnerCommissionCents({ eventType: "ACTIVATION", baseAmountCents: 49_900, level: 2 }), 3_493);
  assert.equal(calculatePartnerCommissionCents({ eventType: "ACTIVATION", baseAmountCents: 49_900, level: 3 }), 1_497);
  assert.equal(calculatePartnerCommissionCents({ eventType: "SUBSCRIPTION", baseAmountCents: 99_000, level: 1 }), 17_820);
  assert.equal(calculatePartnerCommissionCents({ eventType: "SUBSCRIPTION", baseAmountCents: 99_000, level: 2 }), 4_950);
  assert.equal(calculatePartnerCommissionCents({ eventType: "SUBSCRIPTION", baseAmountCents: 99_000, level: 3 }), 1_980);
  const platformRevenue = calculatePlatformCommissionRevenueCents({ grossMerchandiseValueCents: 1_000_000, planCode: "SHOP" });
  assert.equal(platformRevenue, 80_000);
  assert.equal(calculatePartnerCommissionCents({ eventType: "PLATFORM_COMMISSION", baseAmountCents: platformRevenue, level: 1 }), 4_000);
  assert.equal(calculateFirstYearAnnualPlanPartnerPayoutCents("CLAIM", 1), 0);
  assert.equal(calculateNonCumulativeMonthlyBonusCents(4), 0);
  assert.equal(calculateNonCumulativeMonthlyBonusCents(5), 5_000);
  assert.equal(calculateNonCumulativeMonthlyBonusCents(10), 15_000);
  assert.equal(calculateNonCumulativeMonthlyBonusCents(99), 100_000);
  assert.equal(calculateNonCumulativeMonthlyBonusCents(100), 250_000);
});

test("Partner codes normalize safely and partner remains an application route", () => {
  assert.equal(normalizePartnerCode(" km_sparta01 "), "KM_SPARTA01");
  assert.equal(normalizePartnerCode("bad code"), null);
  assert.equal(isReservedHubRouteSegment("partner"), true);
});

test("Partner Network migration preserves anti-recruitment, RLS and fee-revenue boundaries", () => {
  const migration = readFileSync("db/migrations/0222_partner_network_foundation.sql", "utf8");
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
  ]) assert.ok(migration.includes(boundary), `Partner Network migration is missing safety boundary: ${boundary}`);
  assert.ok(!migration.includes("'RECRUITMENT'"), "Recruitment must never be a commission source type");

  const manifest = JSON.parse(readFileSync("db/migrations/checksums.0222.json", "utf8")) as Record<string, string>;
  const hash = createHash("sha256").update(migration).digest("hex");
  assert.equal(manifest["0222_partner_network_foundation.sql"], hash);
});

test("Partner portal stays private and referral capture uses governed attribution duration", () => {
  const siteNavigation = readFileSync("apps/web/src/lib/site-navigation.ts", "utf8");
  const referralRoute = readFileSync("apps/web/src/app/refer/[code]/route.ts", "utf8");
  const partnerPage = readFileSync("apps/web/src/app/partner/page.tsx", "utf8");
  const adminNavigation = readFileSync("apps/web/src/lib/admin-navigation.ts", "utf8");
  assert.ok(siteNavigation.includes('"/partner"'));
  assert.ok(referralRoute.includes("PARTNER_ATTRIBUTION_DAYS"));
  assert.ok(referralRoute.includes("httpOnly: true"));
  assert.ok(partnerPage.includes("index: false"));
  assert.ok(adminNavigation.includes('href: "/admin/partner-network"'));
});
