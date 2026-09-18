import { hostname } from "node:os";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { runCatalogueEnrichmentGenerationSlice } from "../apps/web/src/lib/catalogue-enrichment-generation-runtime.ts";
import { runCatalogueEnrichmentPromotionSlice } from "../apps/web/src/lib/catalogue-enrichment-promotion-runtime.ts";
import { runSymphonyaAutoPricingSlice } from "../apps/web/src/lib/symphonya-auto-pricing-runtime.ts";
import { runSymphonyaAutoPublicationSweep } from "../apps/web/src/lib/symphonya-auto-publication-runtime.ts";
import { runSymphonyaCatalogueMaterializationSlice } from "../apps/web/src/lib/symphonya-catalogue-materializer.ts";
import { runSymphonyaCatalogueSyncSlice } from "../apps/web/src/lib/symphonya-catalogue-sync-runtime.ts";
import { runSymphonyaEnrichmentPreparationSlice } from "../apps/web/src/lib/symphonya-enrichment-runtime.ts";
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

const catalogueEnabled = process.env.BLS_SYMPHONYA_CATALOGUE_ENABLED?.trim().toLowerCase() !== "false";
const stockEnabled = process.env.BLS_SYMPHONYA_STOCK_ENABLED?.trim().toLowerCase() !== "false";
const aiEnrichmentEnabled = process.env.BLS_SYMPHONYA_AI_ENRICHMENT_ENABLED?.trim().toLowerCase() === "true";
const workerId = process.env.BLS_SYMPHONYA_WORKER_ID?.trim() || `symphonya-worker:${hostname()}:${process.pid}`;
const pollMs = positiveInteger(process.env.BLS_SYMPHONYA_POLL_MS, 15_000, "BLS_SYMPHONYA_POLL_MS");
const retryMs = positiveInteger(process.env.BLS_SYMPHONYA_RETRY_MS, 30_000, "BLS_SYMPHONYA_RETRY_MS");
const stockIntervalMs = positiveInteger(process.env.BLS_SYMPHONYA_STOCK_INTERVAL_MS, 5 * 60_000, "BLS_SYMPHONYA_STOCK_INTERVAL_MS");
const priceAlertIntervalMs = positiveInteger(process.env.BLS_SYMPHONYA_PRICE_ALERT_INTERVAL_MS, 60_000, "BLS_SYMPHONYA_PRICE_ALERT_INTERVAL_MS");
const materializationCatchupPasses = positiveInteger(
  process.env.BLS_SYMPHONYA_MATERIALIZATION_CATCHUP_PASSES,
  4,
  "BLS_SYMPHONYA_MATERIALIZATION_CATCHUP_PASSES"
);
const pricingCatchupPasses = positiveInteger(
  process.env.BLS_SYMPHONYA_PRICING_CATCHUP_PASSES,
  4,
  "BLS_SYMPHONYA_PRICING_CATCHUP_PASSES"
);

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
  materialization: true,
  automaticPricing: true,
  automaticPublication: process.env.BLS_SYMPHONYA_AUTO_PUBLICATION_ENABLED?.trim().toLowerCase() !== "false",
  automaticSupplierPriceConfirmation: false,
  catalogueEnabled,
  stockEnabled,
  aiEnrichmentEnabled,
  writesSupplierOrders: false,
  partialOrdersAllowed: false
});

try {
  while (!stopping) {
    try {
      let catalogueClaimed = false;
      if (catalogueEnabled) {
        const catalogue = await runSymphonyaCatalogueSyncSlice();
        catalogueClaimed = catalogue.claimed;
        log("info", "symphonya.catalogue_sync_slice", { workerId, ...catalogue });
      }

      for (let pass = 1; pass <= materializationCatchupPasses && !stopping; pass += 1) {
        try {
          const materialization = await runSymphonyaCatalogueMaterializationSlice();
          log("info", "symphonya.catalogue_materialization_slice", { workerId, pass, ...materialization });
          if (!materialization.enabled || materialization.scanned === 0 || materialization.message) break;
        } catch (error) {
          log("error", "symphonya.catalogue_materialization_failed", { workerId, pass, error: safeError(error) });
          break;
        }
      }

      for (let pass = 1; pass <= pricingCatchupPasses && !stopping; pass += 1) {
        try {
          const pricing = await runSymphonyaAutoPricingSlice();
          log("info", "symphonya.auto_pricing_slice", { workerId, pass, ...pricing });
          if (!pricing.enabled || pricing.scanned === 0 || pricing.message !== "auto_pricing_unmanaged_catchup") break;
        } catch (error) {
          log("error", "symphonya.auto_pricing_failed", { workerId, pass, error: safeError(error) });
          break;
        }
      }

      try {
        const enrichment = await runSymphonyaEnrichmentPreparationSlice();
        log("info", "symphonya.catalogue_enrichment_preparation_slice", { workerId, ...enrichment });
      } catch (error) {
        log("error", "symphonya.catalogue_enrichment_preparation_failed", { workerId, error: safeError(error) });
      }

      if (aiEnrichmentEnabled) {
        try {
          const generated = await runCatalogueEnrichmentGenerationSlice(process.env, { supplierCode: "symphonya" });
          log("info", "symphonya.catalogue_enrichment_generation_slice", { workerId, ...generated });
        } catch (error) {
          log("error", "symphonya.catalogue_enrichment_generation_failed", { workerId, error: safeError(error) });
        }
      }

      try {
        const promoted = await runCatalogueEnrichmentPromotionSlice();
        log("info", "symphonya.catalogue_enrichment_promotion_slice", { workerId, ...promoted });
      } catch (error) {
        log("error", "symphonya.catalogue_enrichment_promotion_failed", { workerId, error: safeError(error) });
      }

      // Fresh supplier availability is a publication prerequisite. Run stock
      // before publication when its interval is due so newly-localised products
      // can enter the storefront in the same worker iteration.
      if (stockEnabled && Date.now() >= nextStockSyncAt) {
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

      try {
        const publication = await runSymphonyaAutoPublicationSweep();
        log("info", "symphonya.auto_publication_sweep", { workerId, ...publication });
      } catch (error) {
        log("error", "symphonya.auto_publication_failed", { workerId, error: safeError(error) });
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
      await delay(catalogueEnabled ? (catalogueClaimed ? pollMs : Math.max(pollMs, 30_000)) : pollMs);
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
