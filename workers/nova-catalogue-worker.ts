import { hostname } from "node:os";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { runNovaEnrichmentPreparationSlice } from "../apps/web/src/lib/catalogue-enrichment-runtime.ts";
import { runCatalogueEnrichmentPromotionSlice } from "../apps/web/src/lib/catalogue-enrichment-promotion-runtime.ts";
import { runNovaAutoPublicationSweep, runNovaCategoryRepairSweep } from "../apps/web/src/lib/nova-auto-publication-runtime.ts";
import { novaAutoPricingEnabled, runNovaAutoPricingSlice } from "../apps/web/src/lib/nova-auto-pricing-runtime.ts";
import { runNovaAvailabilityRefreshSweep } from "../apps/web/src/lib/nova-availability-refresh-runtime.ts";
import { runNovaCatalogueSyncSlice } from "../apps/web/src/lib/nova-catalogue-sync-runtime.ts";
import { runNovaCatalogueMaterializationSlice } from "../apps/web/src/lib/nova-catalogue-materializer.ts";
import { runNovaMediaMaterializationSlice } from "../apps/web/src/lib/nova-media-materialization-runtime.ts";
import { runProductColorProfileSyncSlice } from "../apps/web/src/lib/product-color-profile-runtime.ts";
import { assertNovaRuntimeInvariants } from "../apps/web/src/lib/nova-runtime-invariants.ts";
import { runNovaSellabilitySafetySweep } from "../apps/web/src/lib/nova-sellability-safety.ts";
import { novaApiKeyFromEnvironment } from "../integrations/dropship-suppliers/src/nova-v1.ts";

// Railway deployment marker: BrandsGateway availability recovery; watched production rebuild 2026-09-20-r2.
const workerId = process.env.BLS_NOVA_WORKER_ID?.trim() || `nova-catalogue-worker:${hostname()}:${process.pid}`;
const runOnce = environmentFlag(process.env.BLS_NOVA_RUN_ONCE, false);
const runOnceAvailabilityRefresh = environmentFlag(process.env.BLS_NOVA_RUN_AVAILABILITY_REFRESH, false);
const pollMs = positiveInteger(process.env.BLS_NOVA_POLL_MS, 5_000, "BLS_NOVA_POLL_MS");
const retryMs = positiveInteger(process.env.BLS_NOVA_RETRY_MS, 30_000, "BLS_NOVA_RETRY_MS");
const availabilityRefreshMs = positiveInteger(
  process.env.BLS_NOVA_AVAILABILITY_REFRESH_MS,
  60 * 60 * 1_000,
  "BLS_NOVA_AVAILABILITY_REFRESH_MS"
);
const colorProfileIntervalMs = positiveInteger(
  process.env.BLS_COLOR_PROFILE_INTERVAL_MS,
  15 * 60 * 1_000,
  "BLS_COLOR_PROFILE_INTERVAL_MS"
);
const automaticPublicationEnabled = process.env.BLS_NOVA_AUTO_PUBLICATION_ENABLED?.trim().toLowerCase() === "true";
const categoryRepairEnabled = process.env.BLS_NOVA_CATEGORY_REPAIR_ENABLED?.trim().toLowerCase() === "true";
const pricingCatchupMaxPasses = 8;
const materializationCatchupMaxPasses = positiveInteger(
  process.env.BLS_NOVA_MATERIALIZATION_CATCHUP_PASSES,
  8,
  "BLS_NOVA_MATERIALIZATION_CATCHUP_PASSES"
);
const databaseReadinessRetryMs = 5_000;
const databaseReadinessTimeoutMs = 10 * 60_000;

novaApiKeyFromEnvironment();
await waitForDatabaseReadiness();
await assertNovaRuntimeInvariants();

let stopping = false;
let nextAvailabilityRefreshAt = runOnce && !runOnceAvailabilityRefresh ? Number.POSITIVE_INFINITY : 0;
let nextColorProfileAt = 0;
const requestStop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log("info", "nova.worker_shutdown_requested", { signal });
};
process.once("SIGTERM", () => requestStop("SIGTERM"));
process.once("SIGINT", () => requestStop("SIGINT"));

log("info", "nova.worker_started", {
  workerId, pollMs, availabilityRefreshMs, colorProfileIntervalMs, availabilityTtlHours: 2,
  supplier: "nova_brandsgateway", writesSupplierOrders: false, materializesPublicOffers: false,
  automaticPublication: automaticPublicationEnabled, automaticPricing: novaAutoPricingEnabled(), categoryRepairEnabled, pricingCatchupMaxPasses,
  materializationCatchupMaxPasses,
  catalogueEnrichment: {
    preparation: "worker",
    generation: "chatgpt_agent",
    promotion: "worker",
    applicationSideAiGeneration: false
  },
  runtimeInvariantsVerified: true,
  executionMode: runOnce ? "run_once" : "continuous",
  runOnceAvailabilityRefresh
});

try {
  while (!stopping) {
    try {
      if (categoryRepairEnabled) {
        try {
          const repaired = await runNovaCategoryRepairSweep();
          log("info", "nova.category_repair_sweep", { workerId, repaired });
        } catch (error) {
          log("error", "nova.category_repair_failed", { workerId, error: safeError(error) });
        }
      }

      const preRefreshPricingReady = await ensurePricingReadyForPublication("pre_refresh");
      if (automaticPublicationEnabled && preRefreshPricingReady) {
        try {
          const publication = await runNovaAutoPublicationSweep();
          log("info", "nova.auto_publication_sweep", { workerId, phase: "pre_refresh", ...publication });
        } catch (error) {
          log("error", "nova.auto_publication_failed", { workerId, phase: "pre_refresh", error: safeError(error) });
        }
      } else if (automaticPublicationEnabled) {
        log("error", "nova.auto_publication_skipped_unpriced", { workerId, phase: "pre_refresh" });
      }

      if (Date.now() >= nextColorProfileAt) {
        const startedAt = Date.now();
        try {
          const colorProfiles = await runProductColorProfileSyncSlice({
            ...process.env,
            BLS_COLOR_PROFILE_BATCH_SIZE: process.env.BLS_COLOR_PROFILE_BATCH_SIZE?.trim() || "100"
          });
          log("info", "nova.product_color_profile_sync_slice", { workerId, ...colorProfiles });
        } catch (error) {
          log("error", "nova.product_color_profile_sync_failed", { workerId, error: safeError(error) });
        } finally {
          nextColorProfileAt = startedAt + colorProfileIntervalMs;
        }
      }

      if (Date.now() >= nextAvailabilityRefreshAt) {
        const sweepStartedAt = Date.now();
        try {
          const availability = await runNovaAvailabilityRefreshSweep();
          log("info", "nova.availability_full_sweep", { workerId, ...availability });
        } catch (error) {
          log("error", "nova.availability_full_sweep_failed", { workerId, error: safeError(error) });
        } finally {
          nextAvailabilityRefreshAt = sweepStartedAt + availabilityRefreshMs;
        }
      }

      const result = await runNovaCatalogueSyncSlice();
      log("info", "nova.catalogue_sync_slice", { workerId, ...result });
      if (result.claimed) {
        const sellabilitySafety = await runNovaSellabilitySafetySweep();
        log("info", "nova.sellability_safety_sweep", { workerId, ...sellabilitySafety });
        await recordNovaSupplierHealthy();
      }

      try {
        for (let pass = 1; pass <= materializationCatchupMaxPasses && !stopping; pass += 1) {
          const materialization = await runNovaCatalogueMaterializationSlice();
          log("info", "nova.catalogue_materialization_slice", { workerId, catchupPass: pass, ...materialization });
          if (!materialization.enabled || materialization.scanned === 0) break;
          if (materialization.message === "materialization_source_empty" || materialization.message === "materialization_cursor_wrapped") break;
        }
      } catch (error) {
        log("error", "nova.catalogue_materialization_failed", { workerId, error: safeError(error) });
      }

      try {
        const mediaMaterialization = await runNovaMediaMaterializationSlice();
        log("info", "nova.media_materialization_slice", { workerId, ...mediaMaterialization });
      } catch (error) {
        log("error", "nova.media_materialization_failed", { workerId, error: safeError(error) });
      }

      const postMaterializationPricingReady = await ensurePricingReadyForPublication("post_materialization");
      if (automaticPublicationEnabled && postMaterializationPricingReady) {
        try {
          const publication = await runNovaAutoPublicationSweep();
          log("info", "nova.auto_publication_sweep", { workerId, phase: "post_materialization", ...publication });
        } catch (error) {
          log("error", "nova.auto_publication_failed", { workerId, phase: "post_materialization", error: safeError(error) });
        }
      } else if (automaticPublicationEnabled) {
        log("error", "nova.auto_publication_skipped_unpriced", { workerId, phase: "post_materialization" });
      }

      try {
        const enrichmentPreparation = await runNovaEnrichmentPreparationSlice();
        log("info", "nova.catalogue_enrichment_preparation_slice", { workerId, ...enrichmentPreparation });
      } catch (error) {
        log("error", "nova.catalogue_enrichment_preparation_failed", { workerId, error: safeError(error) });
      }

      // Greek copy is authored and validated by the ChatGPT Catalogue Agent, not by an
      // application-side model/API. The production worker only promotes already-validated
      // agent output into product_translations and reuses it for newly eligible variants.
      try {
        const enrichmentPromotion = await runCatalogueEnrichmentPromotionSlice();
        log("info", "nova.catalogue_enrichment_promotion_slice", { workerId, ...enrichmentPromotion });
      } catch (error) {
        log("error", "nova.catalogue_enrichment_promotion_failed", { workerId, error: safeError(error) });
      }

      if (stopping) break;
      if (runOnce) {
        log("info", "nova.run_once_complete", { workerId, claimed: result.claimed });
        break;
      }
      await delay(result.claimed ? pollMs : Math.max(pollMs, 15_000));
    } catch (error) {
      log("error", "nova.catalogue_sync_failed", { workerId, error: safeError(error) });
      if (stopping) break;
      if (runOnce) throw error;
      await delay(retryMs);
    }
  }
} finally {
  await getProductionPostgresRuntime().close();
  log("info", "nova.worker_stopped", { workerId });
}

async function ensurePricingReadyForPublication(phase: "pre_refresh" | "post_materialization"): Promise<boolean> {
  if (!novaAutoPricingEnabled()) {
    log("error", "nova.auto_pricing_required_for_publication", { workerId, phase, enabled: false });
    return false;
  }
  try {
    for (let pass = 1; pass <= pricingCatchupMaxPasses && !stopping; pass += 1) {
      const pricing = await runNovaAutoPricingSlice();
      log("info", "nova.auto_pricing_slice", { workerId, phase, catchupPass: pass, ...pricing });
      if (!pricing.enabled) return false;
      if (pricing.message !== "auto_pricing_unmanaged_catchup" || pricing.scanned === 0) return true;
    }
    log("error", "nova.auto_pricing_catchup_limit_reached", { workerId, phase, maxPasses: pricingCatchupMaxPasses });
    return false;
  } catch (error) {
    log("error", "nova.auto_pricing_failed", { workerId, phase, error: safeError(error) });
    return false;
  }
}

async function recordNovaSupplierHealthy(): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.dropship_suppliers
    SET last_healthcheck_at=now(), last_healthcheck_ok=true, updated_at=now()
    WHERE code='nova_brandsgateway' AND active=true
  `);
}

async function waitForDatabaseReadiness(): Promise<void> {
  const startedAt = Date.now();
  let attempt = 0;
  let lastMessage = "database readiness not checked";

  while (Date.now() - startedAt < databaseReadinessTimeoutMs) {
    attempt += 1;
    try {
      const readiness = await productionDatabaseReadiness();
      log(readiness.ok ? "info" : "error", "nova.database_readiness", {
        ok: readiness.ok,
        attempt,
        waitedMs: Date.now() - startedAt,
        appliedSchemaVersion: readiness.appliedSchemaVersion,
        expectedSchemaVersion: readiness.expectedSchemaVersion,
        message: readiness.message
      });
      if (readiness.ok) return;
      lastMessage = readiness.message;
    } catch (error) {
      lastMessage = safeError(error);
      log("error", "nova.database_readiness", {
        ok: false,
        attempt,
        waitedMs: Date.now() - startedAt,
        message: lastMessage
      });
    }

    const remainingMs = databaseReadinessTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    await delay(Math.min(databaseReadinessRetryMs, remainingMs));
  }

  throw new Error(`Nova catalogue worker refused to start after waiting for database readiness: ${lastMessage}`);
}

function environmentFlag(raw: string | undefined, fallback: boolean): boolean {
  if (!raw?.trim()) return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(`Invalid boolean environment flag: ${raw}`);
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
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function log(level: "info" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}
