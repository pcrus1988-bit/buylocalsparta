import { hostname } from "node:os";
import { runCatalogueIntakeAutomationCycle } from "../apps/web/src/lib/catalogue-intake-automation-runtime.ts";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";

const workerId = process.env.BLS_CATALOGUE_INTAKE_WORKER_ID?.trim()
  || `catalogue-intake-automation:${hostname()}:${process.pid}`;
const maxGroups = positiveInteger(process.env.BLS_CATALOGUE_INTAKE_MAX_GROUPS, 3, "BLS_CATALOGUE_INTAKE_MAX_GROUPS");
const intelligenceLimit = positiveInteger(process.env.BLS_CATALOGUE_INTELLIGENCE_LIMIT, 25, "BLS_CATALOGUE_INTELLIGENCE_LIMIT");

const readiness = await productionDatabaseReadiness();
if (!readiness.ok) {
  throw new Error(`Catalogue intake automation refused to run: ${readiness.message}`);
}

const runtime = getProductionPostgresRuntime();
try {
  const result = await runCatalogueIntakeAutomationCycle(runtime, {
    workerId,
    maxGroups,
    intelligenceLimit
  });

  log(result.failedGroups === 0 ? "info" : "error", "catalogue_intake.worker_cycle_completed", result);
  if (result.failedGroups > 0) process.exitCode = 1;
} finally {
  await runtime.close();
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function log(level: "info" | "error", event: string, details: Record<string, unknown>): void {
  const payload = JSON.stringify({ level, event, at: new Date().toISOString(), ...details });
  if (level === "error") console.error(payload);
  else console.info(payload);
}
