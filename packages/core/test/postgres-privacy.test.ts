import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCustomerPrivacyRepository, type SqlPool, type SqlQueryResult, type SqlRow } from "../src/index.ts";

class Client {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  #counter = 0;
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM/i.test(text)) {
      this.#counter += 1;
      return { rowCount: 1, rows: [{ id: `00000000-0000-4000-8000-${String(this.#counter).padStart(12, "0")}` }] as Row[] };
    }
    if (/SELECT email::text AS email FROM users/i.test(text)) return { rowCount: 1, rows: [{ email: "private@example.test" }] as Row[] };
    if (/SELECT recommendations_enabled/i.test(text)) return { rowCount: 1, rows: [{ recommendations_enabled: true, recently_viewed_enabled: true, updated_at: new Date(1000) }] as Row[] };
    return { rowCount: /^\s*(INSERT|UPDATE|DELETE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}
function pool(client: Client): SqlPool { return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) }; }

test("Postgres privacy persistence scopes saved/recent data to the customer and supports clear-on-opt-out", async () => {
  const client = new Client();
  const repo = new PostgresCustomerPrivacyRepository(pool(client));
  await repo.savePreferences({ scope: { actorUserId: "user-public" }, preferences: { userId: "user-public", recommendationsEnabled: false, recentlyViewedEnabled: false, updatedAt: 1000 } });
  await repo.saveProduct({ scope: { actorUserId: "user-public" }, item: { userId: "user-public", canonicalVariantId: "product-public", savedAt: 1000 } });
  await repo.eraseNonEssentialPersonalization({ scope: { actorUserId: "user-public" }, userId: "user-public", now: 1200 });
  assert.equal(client.calls.some((call) => /DELETE FROM recently_viewed_products/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /recommendations_enabled=false,recently_viewed_enabled=false/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /DELETE FROM saved_searches/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO saved_products/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /app.actor_user_id/i.test(String(call.params[0])) || call.params.includes("app.actor_user_id")), true);
});

test("Postgres account closure pseudonymises identity, revokes sessions and clears non-required personalization", async () => {
  const client = new Client();
  const repo = new PostgresCustomerPrivacyRepository(pool(client));
  await repo.closeCustomerAccount({ scope: { actorUserId: "user-public" }, userId: "user-public", now: 2000 });
  assert.equal(client.calls.some((call) => /DELETE FROM saved_products/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /DELETE FROM user_sessions/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /DELETE FROM saved_search_alert_events/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /governed_business_identity/i.test(call.text)), true);
  const update = client.calls.find((call) => /UPDATE users SET email=/i.test(call.text));
  assert.ok(update);
  assert.equal(update.params.includes("private@example.test"), false);
  assert.equal(client.calls.some((call) => /SERIALIZABLE/i.test(call.text)), true);
});
