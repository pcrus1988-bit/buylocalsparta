import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import {
  novaAvailabilityPageConcurrency,
  novaAvailabilityRequestsPerMinute,
  refreshNovaStorefrontAvailabilityReadModels,
  runNovaAvailabilityRefreshSweep
} from "../apps/web/src/lib/nova-availability-refresh-runtime.ts";
import { assertNovaRuntimeInvariants } from "../apps/web/src/lib/nova-runtime-invariants.ts";
import { novaApiKeyFromEnvironment } from "../integrations/dropship-suppliers/src/nova-v1.ts";

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}

function log(level: "info" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}

async function main(): Promise<void> {
  novaApiKeyFromEnvironment();
  const readiness = await productionDatabaseReadiness();
  if (!readiness.ok) {
    throw new Error(`Nova availability worker database not ready: ${readiness.message}`);
  }
  await assertNovaRuntimeInvariants();

  log("info", "nova.availability_actions_started", {
    requestsPerMinute: novaAvailabilityRequestsPerMinute(),
    pageConcurrency: novaAvailabilityPageConcurrency(),
    availabilityTtlHours: 2
  });

  const sweepStartedAt = Date.now();
  const sweep = await runNovaAvailabilityRefreshSweep();
  log("info", "nova.availability_actions_sweep_completed", {
    ...sweep,
    durationMs: Date.now() - sweepStartedAt
  });

  if (sweep.refreshedProducts > 0) {
    const projectionStartedAt = Date.now();
    const projections = await refreshNovaStorefrontAvailabilityReadModels();
    log("info", "nova.availability_actions_storefront_projections_refreshed", {
      durationMs: Date.now() - projectionStartedAt,
      refreshedViews: projections.refreshedViews
    });
  } else {
    log("info", "nova.availability_actions_storefront_projection_skipped", {
      reason: "availability_lease_not_claimed_or_supplier_feed_empty"
    });
  }
}

try {
  await main();
} catch (error) {
  log("error", "nova.availability_actions_failed", { error: safeError(error) });
  process.exitCode = 1;
} finally {
  await getProductionPostgresRuntime().close();
}
