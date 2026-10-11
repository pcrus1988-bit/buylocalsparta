import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sweep = readFileSync("apps/web/src/lib/customer-fiscal-reconciliation-sweep.ts", "utf8");
const giftCards = readFileSync("apps/web/src/lib/gift-card-fiscalization.ts", "utf8");
const orderSla = readFileSync("apps/web/src/app/api/cron/order-sla/route.ts", "utf8");
const fiscalCron = readFileSync("apps/web/src/app/api/cron/fiscal-reconciliation/route.ts", "utf8");

test("un-numbered manual-review sales no longer repeatedly re-verify captured Mollie payments", () => {
  const start = sweep.indexOf("const pendingPreparationOrders =");
  const end = sweep.indexOf("for (const pendingDocument", start);
  assert.ok(start !== -1 && end > start, "pending customer-sale backfill query must exist");
  const query = sweep.slice(start, end);
  assert.match(query, /td\.transmission_status='not_ready'/);
  assert.doesNotMatch(query, /td\.transmission_status\s+IN\s*\([^)]*manual_review/);
  assert.match(query, /td\.document_number IS NULL/);
});

test("SPV reconciliation retains numbered uncertain invoices but excludes unnumbered manual review", () => {
  const start = giftCards.indexOf("export async function finalizePendingGiftCardSpvIssues");
  const end = giftCards.indexOf("let processed =", start);
  assert.ok(start !== -1 && end > start, "gift-card SPV recovery selection must exist");
  const query = giftCards.slice(start, end);
  assert.match(query, /td\.transmission_status IN \('not_ready','ready'\)/);
  assert.match(query, /td\.transmission_status='manual_review' AND td\.document_number IS NOT NULL/);
});

test("only the dedicated authenticated endpoint schedules recurring fiscal recovery", () => {
  assert.doesNotMatch(orderSla, /runCustomerFiscalReconciliationSweep|fiscalRecoveryBestEffort/);
  assert.match(fiscalCron, /authorizeFiscalReconciliationCron/);
  assert.match(fiscalCron, /runCustomerFiscalReconciliationSweep\(Date\.now\(\)\)/);
});
