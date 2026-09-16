import { hostname } from "node:os";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { runSymphonyaCatalogueSyncSlice } from "../apps/web/src/lib/symphonya-catalogue-sync-runtime.ts";
import { runSymphonyaPriceAlertSweep } from "../apps/web/src/lib/symphonya-price-alert-runtime.ts";
import { runSymphonyaStockSyncSlice } from "../apps/web/src/lib/symphonya-stock-sync-runtime.ts";

const workerEnabled = process.env.BLS_SYMPHONYA_WORKER_ENABLED?.trim().toLowerCase() === "true";
if (!workerEnabled) {
  console.info(JSON.stringify({
    level: "info",
    event: "symphonya.worker_disabled",
    at: new Date().toISOString(),
    reason: "BLS_SYMPHONYA_WORKER_ENABLED is not true"
  }));
  process.exit(0);
}

const workerId = process.env.BLS_SYMPHONYA_WORKER_ID?.trim() || `symphonya-worker:${hostname()}:${process.pid}`;
const pollMs = positiveInteger(process.env.BLS_SYMPHONYA_POLL_MS, 15_000, "BLS_SYMPHONYA_POLL_MS");
const retryMs = positiveInteger(process.env.BLS_SYMPHONYA_RETRY_MS, 30_000, "BLS_SYMPHONYA_RETRY_MS");
const stockIntervalMs = positiveInteger(process.env.BLS_SYMPHONYA_STOCK_INTERVAL_MS, 5 * 60_000, "BLS_SYMPHONYA_STOCK_INTERVAL_MS");
const priceAlertIntervalMs = positiveInteger(process.env.BLS_SYMPHONYA_PRICE_ALERT_INTERVAL_MS, 60_000, "BLS_SYMPHONYA_PRICE_ALERT_INTERVAL_MS");

const readiness = await productionDatabaseReadiness();
if (!readiness.ok) throw new Error(`Symphonya worker refused to start: ${readiness.message}`);

let stopping = false;
let nextStockSyncAt = 0;
let nextPriceAlertAt = 0;
const requestStop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log("info", "symphonya.worker_shutdown_requested", { signal });
};
process.once("SIGTERM", () => requestStop("SIGTERM"));
process.once("SIGINT", () => requestStop("SIGINT"));

log("info", "symphonya.worker_started", {
  workerId,
  pollMs,
  stockIntervalMs,
  priceAlertIntervalMs,
  supplier: "symphonya",
  catalogueServingLayer: "product_translations",
  automaticSupplierPriceConfirmation: false,
  writesSupplierOrders: false,
  partialOrdersAllowed: false
});

try {
  while (!stopping) {
    try {
      const catalogue = await runSymphonyaCatalogueSyncSlice();
      log("info", "symphonya.catalogue_sync_slice", { workerId, ...catalogue });

      if (Date.now() >= nextStockSyncAt) {
        const startedAt = Date.now();
        try {
          const stock = await runSymphonyaStockSyncSlice();
          log("info", "symphonya.stock_sync_slice", { workerId, ...stock });
        } catch (error) {
          log("error", "symphonya.stock_sync_failed", { workerId, error: safeError(error) });
        } finally {
          nextStockSyncAt = startedAt + stockIntervalMs;
        }
      }

      if (Date.now() >= nextPriceAlertAt) {
        const startedAt = Date.now();
        try {
          const alerts = await runSymphonyaPriceAlertSweep();
          log("info", "symphonya.price_alert_sweep", { workerId, ...alerts });
        } catch (error) {
          log("error", "symphonya.price_alert_failed", { workerId, error: safeError(error) });
        } finally {
          nextPriceAlertAt = startedAt + priceAlertIntervalMs;
        }
      }

      if (stopping) break;
      await delay(catalogue.claimed ? pollMs : Math.max(pollMs, 30_000));
    } catch (error) {
      log("error", "symphonya.worker_iteration_failed", { workerId, error: safeError(error) });
      if (stopping) break;
      await delay(retryMs);
    }
  }
} finally {
  await getProductionPostgresRuntime().close();
  log("info", "symphonya.worker_stopped", { workerId });
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

function log(level: "info" | "error", event: string, details: Record<string, unknown>): void {
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}
