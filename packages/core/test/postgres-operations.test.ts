import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresOutboxRepository,
  PostgresScheduledJobStore,
  PostgresSearchProjectionRepository,
  PostgresStockFreshnessRepository,
  type SqlPool,
  type SqlQueryResult,
  type SqlRow
} from "../src/index.ts";

class OpsClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  released = false;
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/RETURNING e\.\*/i.test(text)) return { rowCount: 1, rows: [{ public_id: "evt-public", event_type: "inventory.changed", aggregate_type: "offer", aggregate_public_id: "offer-a", payload: {}, idempotency_key: "inv-a", status: "processing", attempts: 1, available_at: new Date(100), locked_until: new Date(200), lock_owner: "worker-a", created_at: new Date(50) }] as Row[] };
    if (/UPDATE outbox_events SET status='processed'/i.test(text)) return { rowCount: 1, rows: [{ public_id: "evt-public", event_type: "inventory.changed", aggregate_type: "offer", aggregate_public_id: "offer-a", payload: {}, idempotency_key: "inv-a", status: "processed", attempts: 1, available_at: new Date(100), processed_at: new Date(150), created_at: new Date(50) }] as Row[] };
    if (/RETURNING j\.\*/i.test(text)) return { rowCount: 1, rows: [{ name: "stock-freshness", lock_owner: "scheduler-a", locked_until: new Date(500), next_run_at: new Date(0), last_started_at: new Date(100), consecutive_failures: 0 }] as Row[] };
    if (/SELECT id::text AS id FROM markets/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000001" }] as Row[] };
    if (/SELECT id::text AS id FROM vendor_offers/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000002" }] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() { this.released = true; }
}

function pool(client: OpsClient): SqlPool {
  return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) };
}

test("Postgres outbox claims with SKIP LOCKED and worker ownership", async () => {
  const client = new OpsClient();
  const repository = new PostgresOutboxRepository(pool(client));
  const claimed = await repository.claim(100, 10, 30_000, ["inventory.changed"], "worker-a");
  assert.equal(claimed[0]?.lockOwner, "worker-a");
  assert.equal(client.calls.some((call) => /FOR UPDATE SKIP LOCKED/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => call.params.includes("worker-a")), true);
  await repository.complete("evt-public", 150, "worker-a");
  assert.equal(client.calls.some((call) => /lock_owner=\$/i.test(call.text)), true);
});

test("Postgres scheduled jobs and search/freshness projections are platform-scoped", async () => {
  const client = new OpsClient();
  const jobs = new PostgresScheduledJobStore(pool(client));
  const claimed = await jobs.claimDue({ now: 100, ownerId: "scheduler-a", jobNames: ["stock-freshness"], leaseMs: 400, limit: 5 });
  assert.equal(claimed[0]?.name, "stock-freshness");
  assert.equal(client.calls.some((call) => /scheduled_jobs/i.test(call.text) && /SKIP LOCKED/i.test(call.text)), true);

  const search = new PostgresSearchProjectionRepository(pool(client));
  await search.record({ marketId: "sparta", entityType: "product", entityId: "cv-a", result: { entityId: "cv-a", action: "upserted", documentHash: "abc" }, now: 200 });
  assert.equal(client.calls.some((call) => /search_index_state/i.test(call.text)), true);

  const freshness = new PostgresStockFreshnessRepository(pool(client));
  await freshness.confirm({ offerId: "offer-a", vendorId: "vendor-a", confirmedAt: 300, ttlMs: 3600000, source: "manual" });
  assert.equal(client.calls.some((call) => /stock_confirmed_at/i.test(call.text) && /freshness_status='fresh'/i.test(call.text)), true);
});
