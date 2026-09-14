import { hostname } from "node:os";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { runNovaEnrichmentPreparationSlice } from "../apps/web/src/lib/catalogue-enrichment-runtime.ts";
import {
  catalogueEnrichmentGenerationScope,
  runCatalogueEnrichmentGenerationSlice
} from "../apps/web/src/lib/catalogue-enrichment-generation-runtime.ts";
import { runNovaAutoPublicationSweep } from "../apps/web/src/lib/nova-auto-publication-runtime.ts";
import { novaAutoPricingEnabled, runNovaAutoPricingSlice } from "../apps/web/src/lib/nova-auto-pricing-runtime.ts";
import { runNovaAvailabilityRefreshSweep } from "../apps/web/src/lib/nova-availability-refresh-runtime.ts";
import { runNovaCatalogueSyncSlice } from "../apps/web/src/lib/nova-catalogue-sync-runtime.ts";
import { runNovaCatalogueMaterializationSlice } from "../apps/web/src/lib/nova-catalogue-materializer.ts";
import { assertNovaRuntimeInvariants } from "../apps/web/src/lib/nova-runtime-invariants.ts";
import { runNovaSellabilitySafetySweep } from "../apps/web/src/lib/nova-sellability-safety.ts";
import { novaApiKeyFromEnvironment } from "../integrations/dropship-suppliers/src/nova-v1.ts";

const workerId = process.env.BLS_NOVA_WORKER_ID?.trim() || `nova-catalogue-worker:${hostname()}:${process.pid}`;
const pollMs = positiveInteger(process.env.BLS_NOVA_POLL_MS, 5_000, "BLS_NOVA_POLL_MS");
const retryMs = positiveInteger(process.env.BLS_NOVA_RETRY_MS, 30_000, "BLS_NOVA_RETRY_MS");
const availabilityRefreshMs = positiveInteger(
  process.env.BLS_NOVA_AVAILABILITY_REFRESH_MS,
  60 * 60 * 1_000,
  "BLS_NOVA_AVAILABILITY_REFRESH_MS"
);
const automaticPublicationEnabled = process.env.BLS_NOVA_AUTO_PUBLICATION_ENABLED?.trim().toLowerCase() === "true";
const enrichmentGenerationScope = catalogueEnrichmentGenerationScope();
const enrichmentGenerationConfigured = enrichmentGenerationScope.enabled
  && (enrichmentGenerationScope.allowAll || enrichmentGenerationScope.productIds.length > 0);

novaApiKeyFromEnvironment();
const readiness = await productionDatabaseReadiness();
if (!readiness.ok) {
  throw new Error(`Nova catalogue worker refused to start: ${readiness.message}`);
}
await assertNovaRuntimeInvariants();

let stopping = false;
let nextAvailabilityRefreshAt = 0;
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
  availabilityRefreshMs,
  availabilityTtlHours: 2,
  supplier: "nova_brandsgateway",
  writesSupplierOrders: false,
  materializesPublicOffers: false,
  automaticPublication: automaticPublicationEnabled,
  automaticPricing: novaAutoPricingEnabled(),
  catalogueEnrichment: {
    enabled: enrichmentGenerationScope.enabled,
    configured: enrichmentGenerationConfigured,
    scope: enrichmentGenerationScope.allowAll ? "all" : "pilot",
    pilotProductCount: enrichmentGenerationScope.productIds.length,
    batchSize: enrichmentGenerationScope.batchSize,
    maxAttempts: enrichmentGenerationScope.maxAttempts
  },
  runtimeInvariantsVerified: true
});

try {
  while (!stopping) {
    try {
      // Pricing must make bounded progress before any catalogue-wide maintenance.
      // Keeping this ahead of publication also means an offer imported in the previous
      // cycle gets its structured NOVA price initialized before it can be auto-published.
      // The cursor-based runtime is idempotent and safely retries the same slice on failure.
      try {
        const pricing = await runNovaAutoPricingSlice();
        log("info", "nova.auto_pricing_slice", { workerId, phase: "pre_publication", ...pricing });
      } catch (error) {
        // Pricing is a derived layer. Supplier source ingestion remains durable even
        // if a pricing pass fails, and the next loop safely retries the same cursor.
        log("error", "nova.auto_pricing_failed", {
          workerId,
          phase: "pre_publication",
          error: safeError(error)
        });
      }

      // Publication must not be starved by a slow supplier availability sweep after
      // a deploy/restart. Public catalogue queries still enforce the supplier TTL,
      // so publishing staged offers here does not invent stock or make stale stock sellable.
      if (automaticPublicationEnabled) {
        try {
          const publication = await runNovaAutoPublicationSweep();
          log("info", "nova.auto_publication_sweep", { workerId, phase: "pre_refresh", ...publication });
        } catch (error) {
          log("error", "nova.auto_publication_failed", {
            workerId,
            phase: "pre_refresh",
            error: safeError(error)
          });
        }
      }

      if (Date.now() >= nextAvailabilityRefreshAt) {
        const sweepStartedAt = Date.now();
        try {
          const availability = await runNovaAvailabilityRefreshSweep();
          log("info", "nova.availability_full_sweep", { workerId, ...availability });
        } catch (error) {
          log("error", "nova.availability_full_sweep_failed", {
            workerId,
            error: safeError(error)
          });
        } finally {
          // Anchor the next run to the start time. A normal 2-3 minute API sweep therefore
          // still starts approximately once per hour instead of drifting by its own duration.
          nextAvailabilityRefreshAt = sweepStartedAt + availabilityRefreshMs;
        }
      }

      const result = await runNovaCatalogueSyncSlice();
      log("info", "nova.catalogue_sync_slice", { workerId, ...result });

      if (result.claimed) {
        const sellabilitySafety = await runNovaSellabilitySafetySweep();
        log("info", "nova.sellability_safety_sweep", { workerId, ...sellabilitySafety });

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

      if (automaticPublicationEnabled) {
        try {
          const publication = await runNovaAutoPublicationSweep();
          log("info", "nova.auto_publication_sweep", { workerId, phase: "post_materialization", ...publication });
        } catch (error) {
          // Publication is an explicit opt-in capability. Any failure remains fail-closed
          // and cannot make staged supplier catalogue rows public.
          log("error", "nova.auto_publication_failed", {
            workerId,
            phase: "post_materialization",
            error: safeError(error)
          });
        }
      }

      try {
        const enrichmentPreparation = await runNovaEnrichmentPreparationSlice();
        log("info", "nova.catalogue_enrichment_preparation_slice", { workerId, ...enrichmentPreparation });
      } catch (error) {
        // Enrichment preparation is derived metadata. It must never block or roll
        // back durable supplier ingestion/materialization and can safely retry.
        log("error", "nova.catalogue_enrichment_preparation_failed", {
          workerId,
          error: safeError(error)
        });
      }

      if (enrichmentGenerationConfigured) {
        try {
          const enrichmentGeneration = await runCatalogueEnrichmentGenerationSlice();
          log("info", "nova.catalogue_enrichment_generation_slice", { workerId, ...enrichmentGeneration });
        } catch (error) {
          // Language generation is a derived presentation layer. A provider outage,
          // invalid candidate or quota error must never interrupt supplier ingestion,
          // availability, pricing or fulfilment behavior.
          log("error", "nova.catalogue_enrichment_generation_failed", {
            workerId,
            error: safeError(error)
          });
        }
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
