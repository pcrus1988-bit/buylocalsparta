import { describe, expect, it } from "vitest";
import { SerializedSqlExecutor, type SqlExecutor, type SqlQueryResult, type SqlRow } from "./sql.ts";

function emptyResult<Row extends SqlRow>(): SqlQueryResult<Row> {
  return { rows: [], rowCount: 0 };
}

describe("SerializedSqlExecutor", () => {
  it("does not start a second client query until the first one settles", async () => {
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

    expect(started).toEqual(["first"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(started).toEqual(["first", "second"]);
  });

  it("continues the queue after a failed statement", async () => {
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

    await expect(failed).rejects.toThrow("boom");
    await expect(after).resolves.toEqual({ rows: [], rowCount: 0 });
    expect(started).toEqual(["fail", "after"]);
  });
});
