import test from "node:test";
import assert from "node:assert/strict";
import { FeeRuleEngine, Ledger, ProcurementService, SettlementService, money } from "../src/index.ts";

const context = {
  marketId: "sparta", vendorId: "vendor-a", planCode: "local", categoryCode: "electronics", fulfilmentMode: "shipping" as const,
  supplierNet: money(10_000), supplierGross: money(12_400), retailNet: money(15_000), retailGross: money(18_600), shippingReimbursement: money(0), now: 100
};

test("fee rules resolve by contractual precedence rather than highest percentage", () => {
  const fees = new FeeRuleEngine();
  fees.register({ id: "market", feeCode: "sales_service", marketId: "sparta", source: "market_default", calculation: "percentage", basis: "retail_net", rateBps: 700, taxRateBps: 2400, priority: 1, version: 1, active: true, startsAt: 0 });
  fees.register({ id: "plan", feeCode: "sales_service", marketId: "sparta", source: "plan", planCode: "local", calculation: "percentage", basis: "retail_net", rateBps: 500, taxRateBps: 2400, priority: 1, version: 1, active: true, startsAt: 0 });
  fees.register({ id: "vendor", feeCode: "sales_service", marketId: "sparta", source: "vendor_contract", vendorId: "vendor-a", calculation: "percentage", basis: "retail_net", rateBps: 0, taxRateBps: 2400, priority: 1, version: 1, active: true, startsAt: 0 });
  const snapshots = fees.resolve(context);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].ruleId, "vendor");
  assert.equal(snapshots[0].grossAmount.minor, 0);
});

test("matched supplier procurement keeps invoice gross separate from platform service fee and settlement payable", () => {
  const ledger = new Ledger();
  const procurement = new ProcurementService(ledger);
  const settlement = new SettlementService(procurement);
  const order: any = { id: "order-a", lines: [{ id: "line-a", vendorId: "vendor-a", supplierUnitPrice: money(10_000), supplierTaxRateBps: 2400, fulfilledQuantity: 1 }] };
  const record = procurement.accrueFulfilledLines(order, 10)[0];
  assert.equal(record.gross.minor, 12_400);
  procurement.matchInvoice({ procurementId: record.id, invoiceNumber: "INV-1", invoiceGross: money(12_400), now: 20 });
  const fees = new FeeRuleEngine();
  fees.register({ id: "fee", feeCode: "sales_service", marketId: "sparta", source: "plan", planCode: "local", calculation: "percentage", basis: "supplier_net", rateBps: 500, taxRateBps: 2400, priority: 1, version: 1, active: true, startsAt: 0 });
  const snapshots = fees.resolve({ ...context, supplierNet: money(10_000), supplierGross: money(12_400), retailNet: money(15_000), retailGross: money(18_600) });
  const commercial = procurement.applyCommercialSnapshot({ procurementId: record.id, feeSnapshots: snapshots, shippingReimbursement: money(300), now: 30 });
  assert.equal(commercial.gross.minor, 12_400, "supplier invoice gross remains unchanged");
  assert.equal(commercial.serviceFeeGross.minor, 620);
  assert.equal(commercial.payable.minor, 12_080);
  procurement.approvePayable(record.id, 40);
  const batch = settlement.createDraft({ marketId: "sparta", procurementIds: [record.id], periodStart: 0, periodEnd: 100, createdBy: "maker", now: 50 });
  assert.equal(batch.totalPayable.minor, 12_080);
});
