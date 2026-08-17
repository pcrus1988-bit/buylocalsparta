import test from "node:test";
import assert from "node:assert/strict";
import { PostgresSecurityRepository, type SecurityEvent, type SqlPool, type SqlQueryResult, type SqlRow } from "../src/index.ts";

class SecurityClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM users WHERE public_id/i.test(text)) return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000001" }] as Row[] };
    if (/SELECT public_id, event_type, severity/i.test(text)) return {
      rowCount: 1,
      rows: [{ public_id: "sec-1", event_type: "access.denied", severity: "medium", request_id: "req-1", route: "/api/vendor/orders", method: "GET", subject_hash: "hash", actor_public_id: "user-1", details: { reason: "vendor isolation" }, occurred_at: new Date(1_000) }] as Row[]
    };
    if (/DELETE FROM security_events/i.test(text)) return { rowCount: 2, rows: [] as Row[] };
    return { rowCount: /^\s*INSERT/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}

function pool(client: SecurityClient): SqlPool {
  return {
    connect: async () => client,
    query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params)
  };
}

test("Postgres security repository persists privacy-minimised append-only evidence under platform scope", async () => {
  const client = new SecurityClient();
  const repo = new PostgresSecurityRepository(pool(client), 10_000);
  const event: SecurityEvent = {
    id: "sec-1", type: "access.denied", severity: "medium", requestId: "req-1",
    route: "/api/vendor/orders", method: "GET", subjectHash: "hash", actorUserId: "user-1",
    details: { reason: "vendor isolation" }, occurredAt: 1_000
  };
  await repo.record(event);
  const insert = client.calls.find((call) => /INSERT INTO security_events/i.test(call.text));
  assert.ok(insert);
  assert.equal(insert!.params.includes("user@example.com"), false);
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.platform_access") && call.params.includes("true")), true);
  assert.equal((insert!.params[12] as Date).getTime(), 11_000);
});

test("Postgres security repository supports filtered reads and retention deletion without UPDATE mutation", async () => {
  const client = new SecurityClient();
  const repo = new PostgresSecurityRepository(pool(client));
  const recent = await repo.recent({ since: 500, type: "access.denied", limit: 10 });
  assert.equal(recent[0]?.id, "sec-1");
  assert.equal(recent[0]?.actorUserId, "user-1");
  assert.equal(recent[0]?.details?.reason, "vendor isolation");
  const removed = await repo.purgeExpired(20_000);
  assert.equal(removed, 2);
  assert.equal(client.calls.some((call) => /UPDATE security_events/i.test(call.text)), false);
});
