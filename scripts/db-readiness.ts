import { readdir } from "node:fs/promises";
import { createPostgresRuntimeFromEnv } from "../packages/postgres-runtime/src/index.ts";

async function latestMigrationVersion(): Promise<number> {
  const files = await readdir(new URL("../db/migrations/", import.meta.url));
  const versions = files
    .map((file) => /^(\d{4})_.+\.sql$/.exec(file)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10));

  const latest = versions.length > 0 ? Math.max(...versions) : 0;
  if (!Number.isSafeInteger(latest) || latest <= 0) {
    throw new Error("No numbered database migrations were found for readiness verification");
  }
  return latest;
}

const runtime = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-db-readiness" });
try {
  const status = await runtime.readiness(await latestMigrationVersion());
  console.log(JSON.stringify(status, null, 2));
  if (!status.ok) process.exitCode = 1;
} finally {
  await runtime.close();
}
