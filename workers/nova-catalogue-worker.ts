import { hostname } from "node:os";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { novaAutoPricingEnabled, runNovaAutoPricingSlice } from "../apps/web/src/lib/nova-auto-pricing-runtime.ts";
import { runNovaCatalogueSyncSlice } from "../apps/web/src/lib/nova-catalogue-sync-runtime.ts";
import { runNovaCatalogueMaterializationSlice } from "../apps/web/src/lib/nova-catalogue-materializer.ts";
import { novaApiKeyFromEnvironment } from "../integrations/dropship-suppliers/src/nova-v1.ts";

const workerId = process.env.BLS_NOVA_WORKER_ID?.trim() || `nova-catalogue-worker:${hostname()}:${process.pid}`;
const pollMs = positiveInteger(process.env.BLS_NOVA_POLL_MS, 5_000, "BLS_NOVA_POLL_MS");
const retryMs = positiveInteger(process.env.BLS_NOVA_RETRY_MS, 30_000, "BLS_NOVA_RETRY_MS");

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
  pollMs,
  supplier: "nova_brandsgateway",
  writesSupplierOrders: false,
  materializesPublicOffers: false,
  automaticPricing: novaAutoPricingEnabled()
});

try {
  while (!stopping) {
    try {
      const result = await runNovaCatalogueSyncSlice();
      log("info", "nova.catalogue_sync_slice", { workerId, ...result });

      if (result.claimed) {
        await recordNovaSupplierHealthy();
        try {
          const materialization = await runNovaCatalogueMaterializationSlice();
          log("info", "nova.catalogue_materialization_slice", { workerId, ...materialization });
        } catch (error) {
          log("error", "nova.catalogue_materialization_failed", {
            workerId,
            error: safeError(error)
          });
        }
      }

      try {
        const pricing = await runNovaAutoPricingSlice();
        log("info", "nova.auto_pricing_slice", { workerId, ...pricing });
      } catch (error) {
        // Pricing is a derived layer. Supplier source ingestion remains durable even
        // if a pricing pass fails, and the next loop safely retries the same cursor.
        log("error", "nova.auto_pricing_failed", {
          workerId,
          error: safeError(error)
        });
      }

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

async function recordNovaSupplierHealthy(): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.dropship_suppliers
    SET last_healthcheck_at=now(),
        last_healthcheck_ok=true,
        updated_at=now()
    WHERE code='nova_brandsgateway'
      AND active=true
  `);
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
