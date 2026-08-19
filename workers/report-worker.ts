import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";
import { processQueuedReports } from "../apps/web/src/lib/reporting-engine.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-report-worker" });
const db = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
if (!db.ok) {
  await runtime.close();
  throw new Error(`Report worker refused to start: ${db.message}`);
}

const pollMs = positive(process.env.BLS_REPORT_POLL_MS, 5_000, "BLS_REPORT_POLL_MS");
const batch = positive(process.env.BLS_REPORT_BATCH_SIZE, 2, "BLS_REPORT_BATCH_SIZE");
const owner = process.env.BLS_REPORT_WORKER_ID?.trim() || "runtime-configured";
let stopping = false;
const stop = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ level: "info", event: "reports.worker_shutdown", signal }));
  await runtime.close();
};
process.once("SIGTERM", () => void stop("SIGTERM"));
process.once("SIGINT", () => void stop("SIGINT"));
console.log(JSON.stringify({ level: "info", event: "reports.worker_started", owner, pollMs, batch, schema: db.appliedSchemaVersion }));

while (!stopping) {
  const result = await processQueuedReports(batch);
  if (result.processed || result.failed) console.log(JSON.stringify({ level: result.failed ? "error" : "info", event: "reports.generation_tick", ...result }));
  await delay(pollMs);
}

function positive(raw: string | undefined, fallback: number, name: string) {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}
function delay(ms: number) { return new Promise<void>((resolve) => setTimeout(resolve, ms)); }
