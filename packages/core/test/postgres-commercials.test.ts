import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresCommercialRepository,
  money,
  type SqlPool,
  type SqlQueryResult,
  type SqlRow
} from "../src/index.ts";

class CommercialClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  released = false;
  #uuid = 0;
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM/i.test(text)) {
      this.#uuid += 1;
      return { rowCount: 1, rows: [{ id: `00000000-0000-4000-8000-${String(this.#uuid).padStart(12, "0")}` }] as Row[] };
    }
    return { rowCount: /^\s*INSERT/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() { this.released = true; }
}

function pool(client: CommercialClient): SqlPool {
  return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) };
}

test("Postgres commercial repository persists versioned delivery and fee rules behind public IDs", async () => {
  const client = new CommercialClient();
  const repository = new PostgresCommercialRepository(pool(client));
  await repository.saveDeliveryRule({ scope: { platformAccess: true }, rule: {
    id: "delivery-rule-public", marketId: "sparta", mode: "shipping", postcodePrefixes: ["23"],
    baseCharge: money(690), additionalPackageCharge: money(150), freeAboveSubtotal: money(15000),
    priority: 10, version: 2, active: true, startsAt: 1000
  } });
  await repository.saveFeeRule({ scope: { platformAccess: true }, rule: {
    id: "fee-rule-public", feeCode: "sales_service", marketId: "sparta", source: "vendor_contract",
    calculation: "percentage", basis: "supplier_net", vendorId: "vendor-public", planCode: "founding_2026",
    rateBps: 0, taxRateBps: 2400, priority: 100, version: 1, active: true, startsAt: 1000
  } });
  assert.equal(client.calls.some((call) => /INSERT INTO delivery_rules/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO fee_rules/i.test(call.text) && /fee_code/i.test(call.text)), true);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("Postgres commercial repository stores immutable fee snapshots linked to procurement and rule", async () => {
  const client = new CommercialClient();
  const repository = new PostgresCommercialRepository(pool(client));
  await repository.saveFeeSnapshots({ scope: { platformAccess: true }, procurementId: "proc-public", orderId: "order-public", snapshots: [{
    id: "fee-snapshot-public", feeCode: "sales_service", ruleId: "fee-rule-public", ruleVersion: 1,
    source: "plan", basis: "supplier_net", basisAmount: money(10000), netAmount: money(500), taxAmount: money(120), grossAmount: money(620),
    resolvedAt: 2000, resolvedRule: { calculation: "percentage", rateBps: 500 }
  }] });
  const call = client.calls.find((entry) => /INSERT INTO fee_snapshots/i.test(entry.text));
  assert.ok(call);
  assert.equal(call?.params.includes(620), true);
  assert.equal(call?.params.includes(500), true);
});

test("Postgres commercial repository persists dispute case evidence and idempotent provider events", async () => {
  const client = new CommercialClient();
  const repository = new PostgresCommercialRepository(pool(client));
  await repository.saveDispute({ scope: { platformAccess: true }, marketId: "sparta", dispute: {
    id: "dispute-public", provider: "dev-pay", providerCaseId: "case-1", providerEventId: "evt-open-1",
    orderId: "order-public", paymentId: "payment-public", amount: money(5900), reasonCode: "fraudulent",
    status: "submitted", evidence: [{ id: "evidence-public", kind: "proof_of_delivery", reference: "tracking:123", addedBy: "admin-public", addedAt: 1500 }],
    openedAt: 1000, submittedAt: 2000, liabilityReviewRequired: false
  } });
  assert.equal(client.calls.some((call) => /INSERT INTO payment_disputes/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO payment_dispute_evidence/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /payment_dispute_provider_events/i.test(call.text)), true);

  const created = await repository.recordDisputeProviderEvent({
    scope: { platformAccess: true }, disputeId: "dispute-public", provider: "dev-pay", providerEventId: "evt-resolve-1",
    eventType: "chargeback.won", payload: { outcome: "won" }, receivedAt: 2500
  });
  assert.equal(created, true);
});
