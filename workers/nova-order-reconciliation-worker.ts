import { hostname } from "node:os";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { runDropshipOrderReconciliationSweep } from "../apps/web/src/lib/dropship-order-reconciliation.ts";
import { novaApiKeyFromEnvironment } from "../integrations/dropship-suppliers/src/nova-v1.ts";

const workerId = process.env.BLS_NOVA_ORDER_RECONCILIATION_WORKER_ID?.trim()
  || `nova-order-reconciliation-worker:${hostname()}:${process.pid}`;
const pollMs = positiveInteger(
  process.env.BLS_NOVA_ORDER_RECONCILIATION_POLL_MS,
  30_000,
  "BLS_NOVA_ORDER_RECONCILIATION_POLL_MS"
);
const retryMs = positiveInteger(
  process.env.BLS_NOVA_ORDER_RECONCILIATION_RETRY_MS,
  30_000,
  "BLS_NOVA_ORDER_RECONCILIATION_RETRY_MS"
);
const batchLimit = boundedPositiveInteger(
  process.env.BLS_NOVA_ORDER_RECONCILIATION_LIMIT,
  50,
  250,
  "BLS_NOVA_ORDER_RECONCILIATION_LIMIT"
);

// This worker is deliberately read-only with respect to Nova. It only calls GET
// order endpoints; supplier-order submission stays behind the separate forwarding gate.
novaApiKeyFromEnvironment();
const readiness = await productionDatabaseReadiness();
if (!readiness.ok) {
  throw new Error(`Nova order reconciliation worker refused to start: ${readiness.message}`);
}

const runtime = getProductionPostgresRuntime();
const lockClient = await runtime.nativePool.connect();
const lockResult = await lockClient.query<{ claimed: boolean }>(
  "SELECT pg_try_advisory_lock(hashtext($1)) AS claimed",
  ["kontamou:nova-order-reconciliation-worker"]
);
const claimed = lockResult.rows[0]?.claimed === true;
if (!claimed) {
  lockClient.release();
  await runtime.close();
  throw new Error("Nova order reconciliation worker refused to start: advisory lock is already held");
}

let stopping = false;
const requestStop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log("info", "nova.order_reconciliation_shutdown_requested", { workerId, signal });
};
process.once("SIGTERM", () => requestStop("SIGTERM"));
process.once("SIGINT", () => requestStop("SIGINT"));

log("info", "nova.order_reconciliation_worker_started", {
  workerId,
  pollMs,
  batchLimit,
  supplier: "nova_brandsgateway",
  writesSupplierOrders: false
});

try {
  while (!stopping) {
    try {
      const result = await runDropshipOrderReconciliationSweep(Date.now(), batchLimit);
      log("info", "nova.order_reconciliation_sweep", { workerId, ...result });
      if (stopping) break;
      await delay(pollMs);
    } catch (error) {
      log("error", "nova.order_reconciliation_failed", {
        workerId,
        error: safeError(error)
      });
      if (stopping) break;
      await delay(retryMs);
    }
  }
} finally {
  try {
    await lockClient.query(
      "SELECT pg_advisory_unlock(hashtext($1))",
      ["kontamou:nova-order-reconciliation-worker"]
    );
  } catch (error) {
    log("error", "nova.order_reconciliation_unlock_failed", {
      workerId,
      error: safeError(error)
    });
  }
  lockClient.release();
  await runtime.close();
  log("info", "nova.order_reconciliation_worker_stopped", { workerId });
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function boundedPositiveInteger(raw: string | undefined, fallback: number, max: number, name: string): number {
  const value = positiveInteger(raw, fallback, name);
  if (value > max) throw new Error(`${name} must be less than or equal to ${max}`);
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
