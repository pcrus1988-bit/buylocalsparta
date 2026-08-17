import test from "node:test";
import assert from "node:assert/strict";
import { money, PostgresOrderOperationsRepository, type FulfilmentSlaCase, type OrderCancellation, type SqlPool, type SqlQueryResult, type SqlRow, type SubstitutionRequest } from "../src/index.ts";

class Client {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000001" }] as Row[] };
    if (/SELECT s\.public_id,o\.public_id AS order_public_id/i.test(text)) return { rowCount: 1, rows: [{ public_id: "sla-1", order_public_id: "order-1", fulfilment_public_id: "ful-1", vendor_public_id: "vendor-1", stage: "acceptance", state: "breached", opened_at: new Date(1000), due_at: new Date(2000), escalation_at: new Date(3000), breached_at: new Date(2100), escalated_at: null, resolved_at: null, resolution: null }] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}
function pool(client: Client): SqlPool { return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) }; }

const substitution: SubstitutionRequest = { id: "sub-1", orderId: "order-1", lineId: "line-1", customerId: "customer-1", vendorId: "vendor-1", originalCanonicalVariantId: "cv-old", proposedCanonicalVariantId: "cv-new", proposedOfferId: "offer-new", proposedReservationId: "res-new", originalRetailUnitPrice: money(12000), proposedRetailUnitPrice: money(11000), proposedTitle: "New product", reason: "Original failed QA", status: "pending_customer", createdAt: 1000, expiresAt: 2000 };

test("Postgres substitution proposal is written under vendor scope without platform bypass", async () => {
  const client = new Client(); const repo = new PostgresOrderOperationsRepository(pool(client));
  await repo.saveSubstitutionProposal({ scope: {}, substitution });
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.vendor_id") && call.params.includes("vendor-1")), true);
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.platform_access") && call.params.includes("false")), true);
  assert.equal(client.calls.some((call) => /INSERT INTO order_substitution_requests/i.test(call.text)), true);
});

test("Postgres customer substitution decision uses customer RLS context", async () => {
  const client = new Client(); const repo = new PostgresOrderOperationsRepository(pool(client));
  await repo.saveSubstitutionDecision({ scope: {}, substitution: { ...substitution, status: "approved", decidedAt: 1500, decisionReason: "Approved" } });
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.actor_user_id") && call.params.includes("customer-1")), true);
  assert.equal(client.calls.some((call) => /UPDATE order_substitution_requests/i.test(call.text)), true);
});

test("Postgres cancellation persists under the actual customer scope", async () => {
  const client = new Client(); const repo = new PostgresOrderOperationsRepository(pool(client));
  const cancellation: OrderCancellation = { id: "cancel-1", orderId: "order-1", customerId: "customer-1", reason: "Changed mind", status: "completed", paymentOutcome: "authorisation_cancelled", createdAt: 1000, completedAt: 1000 };
  await repo.saveCancellation({ scope: {}, cancellation });
  assert.equal(client.calls.some((call) => /INSERT INTO order_cancellations/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.platform_access") && call.params.includes("false")), true);
});

test("Postgres SLA writes use platform scope while vendor reads remain vendor scoped", async () => {
  const client = new Client(); const repo = new PostgresOrderOperationsRepository(pool(client));
  const sla: FulfilmentSlaCase = { id: "sla-1", orderId: "order-1", fulfilmentId: "ful-1", vendorId: "vendor-1", stage: "acceptance", state: "breached", openedAt: 1000, dueAt: 2000, escalationAt: 3000, breachedAt: 2100 };
  await repo.upsertSlaCase({ scope: {}, slaCase: sla });
  const rows = await repo.listSla({ scope: {}, vendorId: "vendor-1", activeOnly: true });
  assert.equal(rows[0].state, "breached");
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.vendor_id") && call.params.includes("vendor-1")), true);
});
