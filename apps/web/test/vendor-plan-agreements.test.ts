import assert from "node:assert/strict";
import test from "node:test";
import {
  VENDOR_AGREEMENT_PLAN_CODES,
  isVendorAgreementPlanCode,
  planAgreementCommercialSnapshot,
  vendorAgreementPlanTerms
} from "../src/lib/vendor-plan-agreements.ts";
import { HUB_EXPANSION_PLANS } from "../src/lib/hub-expansion-plans.ts";
import { buildDirectoryAgreementPreview } from "../src/lib/vendor-directory-agreement-pdf.ts";
import { buildVendorAgreementDocument } from "../src/lib/vendor-agreement-pdf.ts";

test("all eight agreement generators have unique versioned snapshots", () => {
  assert.equal(VENDOR_AGREEMENT_PLAN_CODES.length, 8);
  assert.equal(new Set(VENDOR_AGREEMENT_PLAN_CODES).size, 8);
  for (const code of VENDOR_AGREEMENT_PLAN_CODES) {
    assert.equal(isVendorAgreementPlanCode(code), true);
    const plan = vendorAgreementPlanTerms(code);
    assert.ok(plan.templateVersion);
    assert.ok(plan.features.length);
    assert.equal(plan.legalReviewStatus, "pending_legal_review");
    assert.ok(plan.setupFeeMinor >= 0);
  }
  assert.equal(isVendorAgreementPlanCode("unknown"), false);
});

test("HUB financial terms always match the public plan catalogue for either cycle", () => {
  for (const hub of HUB_EXPANSION_PLANS) {
    for (const billing of ["annual", "monthly"] as const) {
      const plan = vendorAgreementPlanTerms(hub.code, billing);
      assert.equal(plan.commissionRateBps, hub.commissionBps);
      assert.equal(plan.setupFeeMinor, hub.setupFeeCents);
      assert.equal(plan.recurringFeeMinor,
        hub.code === "claim" || billing === "annual" ? hub.annualFeeCents : hub.monthlyFeeCents);
      assert.equal(plan.kind, hub.ecommerce ? "merchant" : "directory");
    }
  }
});

test("CLAIM and PRESENCE cannot be turned into merchant contracts", () => {
  for (const code of ["claim", "presence"] as const) {
    const plan = vendorAgreementPlanTerms(code);
    assert.equal(plan.kind, "directory");
    assert.equal(plan.commissionRateBps, 0);
    assert.throws(() => planAgreementCommercialSnapshot(plan), /Directory agreements/);
    const document = buildDirectoryAgreementPreview({
      plan, agreementCode: "PREVIEW-TEST", createdAt: "2026-10-11T10:00:00Z",
      vendor: { legalName: "Εταιρεία Δοκιμής", taxNumber: "000000000" }
    });
    const text = JSON.stringify(document);
    assert.match(text, /ΔΕΝ δημιουργεί λογαριασμό εμπόρου/);
    assert.match(text, /iframe/);
    assert.match(text, /ΣΗΜΑΝΤΙΚΟ/);
    assert.match(text, /2026-10-11-v1/);
  }
});

test("merchant plans have locked rates and subscription terms", () => {
  const expected = [
    ["shop", 800, 14900, 1900],
    ["growth", 500, 29900, 3900],
    ["pro", 300, 49900, 9900],
    ["monthly", 700, 49900, 4900],
    ["annual", 500, 29900, 39900],
    ["founding_2026", 200, 150000, 0]
  ] as const;
  for (const [code, commission, setup, recurring] of expected) {
    const plan = vendorAgreementPlanTerms(code);
    const terms = planAgreementCommercialSnapshot(plan);
    assert.equal(terms.commissionRateBps, commission);
    assert.equal(terms.listingFeeMinor, setup);
    assert.equal(terms.recurringFeeMinor, recurring);
    assert.equal(terms.planCode, code);
    assert.deepEqual(terms.entitlements, [...plan.features]);
  }
  assert.equal(vendorAgreementPlanTerms("founding_2026").contractTerm, "36 μήνες");
});

test("only a non-negative, bounded, approved setup discount may be snapshotted", () => {
  const growth = vendorAgreementPlanTerms("growth");
  assert.equal(planAgreementCommercialSnapshot(growth, { approvedSetupFeeMinor: 14950 }).listingFeeMinor, 14950);
  assert.throws(() => planAgreementCommercialSnapshot(growth, { approvedSetupFeeMinor: -1 }));
  assert.throws(() => planAgreementCommercialSnapshot(growth, { approvedSetupFeeMinor: 900000 }));
  assert.throws(() => planAgreementCommercialSnapshot(growth, { approvedSetupFeeMinor: 1.5 }));
});

test("marketplace PDF shows the selected plan, entitlements and legal-review watermark", () => {
  const plan = vendorAgreementPlanTerms("growth", "annual");
  const commercial = planAgreementCommercialSnapshot(plan);
  const pdf = buildVendorAgreementDocument({
    agreementCode: "PREVIEW-TEST", agreementVersion: 1, createdAt: "2026-10-11T10:00:00Z",
    startsAt: "2026-10-11T10:00:00Z", vendor: { legalName: "Εταιρεία Δοκιμής" },
    commercial: { ...commercial, commissionTaxMode: "plus_vat", commissionTaxRateBps: 2400 }
  });
  const text = JSON.stringify(pdf);
  assert.match(text, /GROWTH/);
  assert.match(text, /2026-10-11-v1/);
  assert.match(text, /ΠΡΟΣΧΕΔΙΟ/);
  assert.match(text, /Παρεχόμενες λειτουργίες/);
});
