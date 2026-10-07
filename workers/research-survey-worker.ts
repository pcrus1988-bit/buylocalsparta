import { EXPECTED_SCHEMA_VERSION } from "../packages/postgres-runtime/src/index.ts";
import { getProductionPostgresRuntime } from "../apps/web/src/lib/postgres-runtime.ts";
import { processResearchStudyJobs, RESEARCH_JOB_TYPES, type ResearchJobType } from "../apps/web/src/lib/research-survey-jobs.ts";

const runtime = getProductionPostgresRuntime();
const db = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
if (!db.ok) {
  await runtime.close();
  throw new Error(`Research worker refused to start: ${db.message}`);
}

const pollMs = positive(process.env.BLS_RESEARCH_POLL_MS, 10_000, "BLS_RESEARCH_POLL_MS");
const batch = positive(process.env.BLS_RESEARCH_BATCH_SIZE, 1, "BLS_RESEARCH_BATCH_SIZE");
const allowedJobTypes = researchJobTypes(process.env.BLS_RESEARCH_JOB_TYPES);
let stopping = false;

const stop = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ level: "info", event: "research.worker_shutdown", signal }));
  await runtime.close();
};

process.once("SIGTERM", () => void stop("SIGTERM"));
process.once("SIGINT", () => void stop("SIGINT"));

console.log(JSON.stringify({
  level: "info",
  event: "research.worker_started",
  pollMs,
  batch,
  allowedJobTypes,
  schema: db.appliedSchemaVersion
}));

while (!stopping) {
  const result = await processResearchStudyJobs(batch, allowedJobTypes);
  if (result.claimed || result.failed || result.requeued) {
    console.log(JSON.stringify({
      level: result.failed ? "error" : result.requeued ? "warn" : "info",
      event: "research.worker_tick",
      ...result
    }));
  }
  await delay(pollMs);
}

function positive(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function researchJobTypes(raw: string | undefined): ResearchJobType[] {
  if (!raw?.trim()) return [...RESEARCH_JOB_TYPES];
  const allowed = new Set<string>(RESEARCH_JOB_TYPES);
  const values = [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
  const invalid = values.filter((value) => !allowed.has(value));
  if (invalid.length) throw new Error(`BLS_RESEARCH_JOB_TYPES contains unsupported job types: ${invalid.join(",")}`);
  if (!values.length) throw new Error("BLS_RESEARCH_JOB_TYPES must contain at least one job type");
  return values as ResearchJobType[];
}
