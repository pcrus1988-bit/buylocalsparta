import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, assertPermission, assertVendorScope, can, money } from "../src/index.ts";

test("ledger rejects unbalanced financial events", () => {
  const ledger = new Ledger();
  assert.throws(() => ledger.post({
    reference: "broken",
    createdAt: 1,
    entries: [
      { account: "cash", direction: "debit", amount: money(100) },
      { account: "sales", direction: "credit", amount: money(99) }
    ]
  }));
});

test("ledger posts balanced capture", () => {
  const ledger = new Ledger();
  ledger.post({
    reference: "capture-1",
    createdAt: 1,
    entries: [
      { account: "psp_receivable", direction: "debit", amount: money(12_400) },
      { account: "sales_revenue", direction: "credit", amount: money(10_000) },
      { account: "output_vat", direction: "credit", amount: money(2_400) }
    ]
  });
  assert.equal(ledger.balance("psp_receivable").minor, 12_400);
});

test("vendor roles are permission-limited and vendor scope blocks competitor access", () => {
  assert.equal(can("vendor_catalog", "catalog.write"), true);
  assert.equal(can("vendor_catalog", "finance.read"), false);
  assert.equal(can("vendor_catalog", "fairness.read"), true);
  assert.equal(can("vendor_catalog", "fairness.appeal"), false);
  assert.equal(can("vendor_owner", "fairness.appeal"), true);
  assert.equal(can("platform_finance", "fairness.manage"), false);
  assert.equal(can("vendor_operations", "fairness.manage"), true);
  assert.equal(can("content_seo", "content.write"), true);
  assert.equal(can("platform_finance", "content.write"), false);
  assert.equal(can("vendor_operations", "security.read"), true);
  assert.equal(can("auditor", "security.read"), true);
  assert.equal(can("platform_finance", "security.read"), false);
  assert.equal(can("vendor_owner", "reviews.read"), true);
  assert.equal(can("vendor_owner", "reviews.respond"), true);
  assert.equal(can("vendor_owner", "reviews.report"), true);
  assert.equal(can("vendor_adviser", "reviews.respond"), true);
  assert.equal(can("platform_finance", "reviews.manage"), false);
  assert.equal(can("super_admin", "privacy.manage"), true);
  assert.equal(can("customer_support", "privacy.manage"), true);
  assert.equal(can("vendor_operations", "privacy.read"), true);
  assert.equal(can("platform_finance", "privacy.read"), false);
  assert.equal(can("platform_finance", "privacy.manage"), false);
  assert.equal(can("vendor_operations", "reviews.manage"), true);
  assert.equal(can("vendor_owner", "content.vendor_approve"), true);
  assert.equal(can("vendor_catalog", "content.vendor_approve"), false);
  assert.throws(() => assertPermission("vendor_catalog", "finance.read"));
  assert.doesNotThrow(() => assertVendorScope("vendor-a", "vendor-a"));
  assert.throws(() => assertVendorScope("vendor-a", "vendor-b"));
});

import { IdempotentEventInbox } from "../src/index.ts";

test("duplicate webhook event is processed exactly once", () => {
  const inbox = new IdempotentEventInbox<{ amount: number }>();
  assert.equal(inbox.receive("evt-1", { amount: 100 }).duplicate, false);
  assert.equal(inbox.receive("evt-1", { amount: 100 }).duplicate, true);
  let sideEffects = 0;
  const first = inbox.process("evt-1", (payload) => { sideEffects += 1; return payload.amount * 2; });
  const second = inbox.process("evt-1", () => { sideEffects += 1; return 999; });
  assert.equal(first.result, 200);
  assert.equal(second.result, 200);
  assert.equal(second.duplicateProcessing, true);
  assert.equal(sideEffects, 1);
});
