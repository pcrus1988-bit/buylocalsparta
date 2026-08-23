import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresUnitOfWork,
  SerializedSqlExecutor,
  type SqlExecutor,
  type SqlPool,
  type SqlQueryResult,
  type SqlRow
} from "../src/index.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("SerializedSqlExecutor never overlaps queries on one client", async () => {
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const executor: SqlExecutor = {
    async query<Row extends SqlRow = SqlRow>(text: string): Promise<SqlQueryResult<Row>> {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${text}`);
      await delay(text === "first" ? 12 : 1);
      order.push(`end:${text}`);
      active -= 1;
      return { rows: [], rowCount: 0 } as SqlQueryResult<Row>;
    }
  };
  const serialized = new SerializedSqlExecutor(executor);
  await Promise.all([
    serialized.query("first"),
    serialized.query("second"),
    serialized.query("third")
  ]);

  assert.equal(maxActive, 1);
  assert.deepEqual(order, [
    "start:first", "end:first",
    "start:second", "end:second",
    "start:third", "end:third"
  ]);
});

test("SerializedSqlExecutor continues after a rejected query", async () => {
  const calls: string[] = [];
  const executor: SqlExecutor = {
    async query<Row extends SqlRow = SqlRow>(text: string): Promise<SqlQueryResult<Row>> {
      calls.push(text);
      if (text === "broken") throw new Error("expected failure");
      return { rows: [], rowCount: 0 } as SqlQueryResult<Row>;
    }
  };
  const serialized = new SerializedSqlExecutor(executor);
  const broken = serialized.query("broken");
  const healthy = serialized.query("healthy");
  await assert.rejects(broken, /expected failure/);
  await healthy;
  assert.deepEqual(calls, ["broken", "healthy"]);
});

test("PostgresUnitOfWork serializes Promise.all domain reads before commit", async () => {
  let active = 0;
  let maxActive = 0;
  const calls: string[] = [];
  const client = {
    async query<Row extends SqlRow = SqlRow>(text: string): Promise<SqlQueryResult<Row>> {
      calls.push(text);
      const domainRead = text.startsWith("DOMAIN ");
      if (domainRead) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(4);
        active -= 1;
      }
      return { rows: [], rowCount: 0 } as SqlQueryResult<Row>;
    },
    release() {}
  };
  const pool: SqlPool = {
    async connect() { return client; },
    async query<Row extends SqlRow = SqlRow>(text: string): Promise<SqlQueryResult<Row>> {
      return client.query<Row>(text);
    }
  };

  const uow = new PostgresUnitOfWork(pool);
  await uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
    await Promise.all([tx.query("DOMAIN A"), tx.query("DOMAIN B"), tx.query("DOMAIN C")]);
  });

  assert.equal(maxActive, 1);
  assert.equal(calls.at(-1), "COMMIT");
});
