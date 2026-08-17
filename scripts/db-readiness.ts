import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-db-readiness" });
try {
  const status = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
  console.log(JSON.stringify(status, null, 2));
  if (!status.ok) process.exitCode = 1;
} finally {
  await runtime.close();
}
