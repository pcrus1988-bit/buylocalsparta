import { hostname } from "node:os";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { runNovaCatalogueSyncSlice } from "../apps/web/src/lib/nova-catalogue-sync-runtime.ts";
import { novaApiKeyFromEnvironment } from "../integrations/dropship-suppliers/src/nova-v1.ts";

const workerId = process.env.BLS_NOVA_WORKER_ID?.trim() || `nova-catalogue-worker:${hostname()}:${process.pid}`;
const pollMs = positiveInteger(process.env.BLS_NOVA_POLL_MS, 5_000, "BLS_NOVA_POLL_MS");
const retryMs = positiveInteger(process.env.BLS_NOVA_RETRY_MS, 30_000, "BLS_NOVA_RETRY_MS");

// Fail before entering the loop if either durable state or supplier credentials are unavailable.
novaApiKeyFromEnvironment();
const readiness = await productionDatabaseReadiness();
if (!readiness.ok) {
  throw new Error(`Nova catalogue worker refused to start: ${readiness.message}`);
}

let stopping = false;
const requestStop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log("info", "nova.worker_shutdown_requested", { signal });
};
process.once("SIGTERM", () => requestStop("SIGTERM"));
process.once("SIGINT", () => requestStop("SIGINT"));

log("info", "nova.worker_started", {
  workerId,
  schema: readiness.appliedSchemaVersion,
  pollMs,
  supplier: "nova_brandsgateway",
  writesSupplierOrders: false
});

try {
  while (!stopping) {
    try {
      const result = await runNovaCatalogueSyncSlice();
      log("info", "nova.catalogue_sync_slice", { workerId, ...result });
      if (stopping) break;
      await delay(result.claimed ? pollMs : Math.max(pollMs, 15_000));
    } catch (error) {
      log("error", "nova.catalogue_sync_failed", {
        workerId,
        error: safeError(error)
      });
      if (stopping) break;
      await delay(retryMs);
    }
  }
} finally {
  await getProductionPostgresRuntime().close();
  log("info", "nova.worker_stopped", { workerId });
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(level: "info" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}
