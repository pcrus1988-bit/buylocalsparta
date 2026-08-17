import test from "node:test";
import assert from "node:assert/strict";
import { PostgresEngagementRepository, type SqlPool, type SqlQueryResult, type SqlRow } from "../src/index.ts";

class Client {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  #counter = 0;
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM (users|canonical_variants|markets)/i.test(text)) {
      this.#counter += 1;
      return { rowCount: 1, rows: [{ id: `00000000-0000-4000-8000-${String(this.#counter).padStart(12,"0")}` }] as Row[] };
    }
    if (/SELECT id::text AS id FROM saved_searches/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-888888888888" }] as Row[] };
    if (/SELECT id::text AS id FROM saved_product_alert_preferences/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-999999999999" }] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE|DELETE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}
function pool(client: Client): SqlPool { return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) }; }

test("Postgres engagement persistence stores customer-scoped alert preferences and append-only events", async () => {
  const client = new Client();
  const repo = new PostgresEngagementRepository(pool(client));
  const preference = { id: "saved-alert-1", userId: "user-public", canonicalVariantId: "product-public", backInStockEnabled: true, priceDropEnabled: true, minimumPriceDropMinor: 100, lastObservedAvailable: false, lastObservedPriceMinor: 1500, lastObservedAt: 1000, createdAt: 900, updatedAt: 1000 } as const;
  await repo.saveAlertPreference({ scope: { actorUserId: "user-public" }, preference });
  await repo.recordAlertEvent({ scope: { actorUserId: "system-worker" }, event: { id: "event-1", preferenceId: preference.id, userId: preference.userId, canonicalVariantId: preference.canonicalVariantId, type: "back_in_stock", previousAvailable: false, available: true, createdAt: 2000 } });
  assert.equal(client.calls.some((call) => /INSERT INTO saved_product_alert_preferences/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO saved_product_alert_events/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => call.params.includes("true")), true);
});


test("Postgres engagement persistence stores saved-search baselines and append-only new-match events", async () => {
  const client = new Client();
  const repo = new PostgresEngagementRepository(pool(client));
  const saved = { id: "saved-search-1", userId: "user-public", marketId: "sparta", name: "Travel bottle", query: { q: "ZXQJ-987654321", availability: "any" as const }, alertsEnabled: true, seenCanonicalVariantIds: [], lastObservedCount: 0, lastObservedAt: 1000, createdAt: 900, updatedAt: 1000 };
  await repo.saveSavedSearch({ scope: { actorUserId: "user-public", marketId: "sparta" }, search: saved });
  await repo.recordSavedSearchAlertEvent({ scope: { actorUserId: "system-worker", platformAccess: true }, event: { id: "saved-search-event-1", savedSearchId: saved.id, userId: saved.userId, canonicalVariantId: "product-public", type: "new_match", createdAt: 2000 } });
  assert.equal(client.calls.some((call) => /INSERT INTO saved_searches/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO saved_search_alert_events/i.test(call.text)), true);
  await repo.clearUserSavedSearches({ scope: { actorUserId: "user-public" }, userId: "user-public" });
  assert.equal(client.calls.some((call) => /app.privacy_erasure/i.test(call.text)), true);
});
