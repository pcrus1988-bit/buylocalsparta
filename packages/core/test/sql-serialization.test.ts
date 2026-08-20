import test from "node:test";
import assert from "node:assert/strict";
import { SerializedSqlExecutor, type SqlExecutor, type SqlQueryResult, type SqlRow } from "../src/persistence/sql.ts";

function emptyResult<Row extends SqlRow>(): SqlQueryResult<Row> {
  return { rows: [], rowCount: 0 };
}

test("SerializedSqlExecutor does not start a second client query until the first settles", async () => {
  const started: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const executor: SqlExecutor = {
    async query<Row extends SqlRow = SqlRow>(text: string): Promise<SqlQueryResult<Row>> {
      started.push(text);
      if (text === "first") await firstGate;
      return emptyResult<Row>();
    }
  };
  const serialized = new SerializedSqlExecutor(executor);

  const first = serialized.query("first");
  const second = serialized.query("second");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(started, ["first"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(started, ["first", "second"]);
});

test("SerializedSqlExecutor continues the queue after a failed statement", async () => {
  const started: string[] = [];
  const executor: SqlExecutor = {
    async query<Row extends SqlRow = SqlRow>(text: string): Promise<SqlQueryResult<Row>> {
      started.push(text);
      if (text === "fail") throw new Error("boom");
      return emptyResult<Row>();
    }
  };
  const serialized = new SerializedSqlExecutor(executor);

  const failed = serialized.query("fail");
  const after = serialized.query("after");

  await assert.rejects(failed, /boom/);
  assert.deepEqual(await after, { rows: [], rowCount: 0 });
  assert.deepEqual(started, ["fail", "after"]);
});
