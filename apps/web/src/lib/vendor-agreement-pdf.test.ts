import assert from "node:assert/strict";
import test from "node:test";
import { buildVendorAgreementDocument } from "./vendor-agreement-pdf.ts";

const sample = {
  agreementCode: "KM-AGR-TEST",
  agreementVersion: 2,
  createdAt: "2026-10-01T09:00:00.000Z",
  startsAt: "2026-10-02T00:00:00.000Z",
  vendor: {
    legalName: "TEST VENDOR IKE",
    tradingName: "Test Store",
    taxNumber: "123456789",
    registeredAddress: "Test 1, Greece",
    legalRepresentative: "Test Representative",
    contactEmail: "vendor@example.com",
    hubId: "KM-HUB-019",
    hubName: "Καλαμάτα",
    hubSlug: "kalamata",
    marketCode: "hub-kalamata"
  },
  commercial: {
    planName: "GROWTH",
    commissionRateBps: 500,
    commissionTaxMode: "plus_vat",
    commissionTaxRateBps: 2400,
    recurringFeeMinor: 3900,
    recurringFeePeriod: "month"
  }
} as const;

test("vendor agreement v2 contains current commerce workflows and HUB evidence", () => {
  const serialized = JSON.stringify(buildVendorAgreementDocument(sample));
  for (const required of [
    "SELLER OF RECORD",
    "Vendor Trial",
    "Ask Local",
    "BAZAAR",
    "Flash Sale",
    "Vendor Daily",
    "ΠΑΡΑΡΤΗΜΑ Δ – ΦΟΡΟΛΟΓΙΚΗ ΡΟΗ / AADE / ΠΑΡΑΣΤΑΤΙΚΑ",
    "ΠΑΡΑΡΤΗΜΑ Ε – HUB / ΠΡΟΓΡΑΜΜΑ / ΛΕΙΤΟΥΡΓΙΚΕΣ ΔΥΝΑΤΟΤΗΤΕΣ",
    "KM-HUB-019",
    "Καλαμάτα",
    "GROWTH"
  ]) {
    assert.ok(serialized.includes(required), `Agreement is missing ${required}`);
  }
});

test("vendor agreement stays provider-neutral", () => {
  const serialized = JSON.stringify(buildVendorAgreementDocument(sample));
  for (const provider of ["Mollie", "Resend", "Amazon SES", "AWS SES"]) {
    assert.equal(serialized.includes(provider), false, `Agreement must not hard-code ${provider}`);
  }
});
