import test from "node:test";
import assert from "node:assert/strict";
import { AnalyticsService, PostgresAnalyticsRepository, type SqlPool, type SqlQueryResult, type SqlRow } from "../src/index.ts";

class AnalyticsClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM markets/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000001" }] as Row[] };
    if (/SELECT id::text AS id FROM users/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000002" }] as Row[] };
    if (/SELECT id::text AS id FROM vendor_businesses/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000003" }] as Row[] };
    if (/SELECT id::text AS id FROM canonical_variants/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000004" }] as Row[] };
    if (/SELECT id::text AS id FROM customer_orders/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000005" }] as Row[] };
    if (/WITH deleted AS/i.test(text)) return { rowCount: 1, rows: [{ deleted: 3 }] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE|DELETE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}
function pool(client: AnalyticsClient): SqlPool { return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) }; }

test("Postgres analytics persists only one-way visitor hash and resolves public IDs under platform scope", async () => {
  const analytics = new AnalyticsService();
  const event = analytics.record({ eventName: "order.vendor_attributed", marketId: "sparta", visitorKey: "raw-browser-cookie", customerId: "user-customer", vendorId: "vendor-demo", canonicalVariantId: "cv-demo", orderId: "order-demo", valueMinor: 12_900, quantity: 1, now: 1_000, metadata: { categoryCode: "technology" }, dedupeKey: "order-vendor-demo" });
  const client = new AnalyticsClient();
  const repo = new PostgresAnalyticsRepository(pool(client));
  await repo.appendEvent({ event });
  const insert = client.calls.find((call) => /INSERT INTO analytics_events/i.test(call.text));
  assert.ok(insert);
  assert.equal(String(insert?.params[5]).length, 64);
  assert.equal(insert?.params.some((value) => value === "raw-browser-cookie"), false);
  assert.equal(client.calls.some((call) => call.params.includes("app.platform_access") && call.params.includes("true")), true);
  assert.equal(client.calls.some((call) => /SELECT id::text AS id FROM vendor_businesses/i.test(call.text)), true);
});

test("Postgres analytics stores vendor-safe rollups and platform-only search demand", async () => {
  const service = new AnalyticsService();
  service.record({ eventName: "product.impression", marketId: "sparta", vendorId: "vendor-demo", now: 100 });
  service.recordSearch({ marketId: "sparta", query: "λάμπα", resultCount: 0, now: 101 });
  const vendor = service.vendorReport({ marketId: "sparta", vendorId: "vendor-demo", from: 0, to: 200 });
  const market = service.marketReport({ marketId: "sparta", from: 0, to: 200 });
  const client = new AnalyticsClient();
  const repo = new PostgresAnalyticsRepository(pool(client));
  await repo.saveVendorRollup({ scope: { actorUserId: "user-admin" }, day: "2026-08-14", report: vendor });
  await repo.saveMarketRollup({ scope: { actorUserId: "user-admin" }, day: "2026-08-14", report: market });
  await repo.replaceSearchDemand({ scope: { actorUserId: "user-admin" }, marketId: "sparta", day: "2026-08-14", rows: market.topQueries });
  assert.equal(client.calls.some((call) => /INSERT INTO analytics_vendor_daily/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO analytics_market_daily/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO analytics_search_terms_daily/i.test(call.text)), true);
});

test("Postgres analytics retention deletion is explicit and counted", async () => {
  const client = new AnalyticsClient();
  const repo = new PostgresAnalyticsRepository(pool(client));
  const removed = await repo.purgeExpired({ scope: { actorUserId: "user-admin" }, now: Date.UTC(2027, 8, 1) });
  assert.equal(removed, 3);
  assert.equal(client.calls.some((call) => /DELETE FROM analytics_events WHERE retention_until/i.test(call.text)), true);
});
