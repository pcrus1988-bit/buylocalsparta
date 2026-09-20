import { hostname } from "node:os";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";
import { runDropshipOrderReconciliationSweep } from "../apps/web/src/lib/dropship-order-reconciliation.ts";
import { runNovaAvailabilityRefreshSweep } from "../apps/web/src/lib/nova-availability-refresh-runtime.ts";
import { assertNovaRuntimeInvariants } from "../apps/web/src/lib/nova-runtime-invariants.ts";
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
const availabilityFailoverEnabled = process.env.BLS_NOVA_AVAILABILITY_FAILOVER_ENABLED?.trim().toLowerCase() !== "false";
const availabilityFailoverCheckMs = positiveInteger(
  process.env.BLS_NOVA_AVAILABILITY_FAILOVER_CHECK_MS,
  5 * 60_000,
  "BLS_NOVA_AVAILABILITY_FAILOVER_CHECK_MS"
);
const databaseReadinessRetryMs = 5_000;
const databaseReadinessTimeoutMs = 10 * 60_000;

type Runtime = ReturnType<typeof getProductionPostgresRuntime>;
type AvailabilityHealth = Readonly<{
  activeOffers: number;
  freshEvidence: number;
  newestCheckedAt: number | null;
  freshRatio: number;
}>;

let stopping = false;
const requestStop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  log("info", "nova.order_reconciliation_shutdown_requested", { workerId, signal });
};
process.once("SIGTERM", () => requestStop("SIGTERM"));
process.once("SIGINT", () => requestStop("SIGINT"));

await main();

async function main(): Promise<void> {
  // Order reconciliation remains read-only with respect to supplier orders. The optional
  // availability failover below only refreshes supplier-authoritative stock evidence and
  // never publishes products, changes prices, or submits supplier orders.
  novaApiKeyFromEnvironment();
  await waitForDatabaseReadiness();
  await assertNovaRuntimeInvariants();

  const runtime = getProductionPostgresRuntime();
  const lockClient = await runtime.nativePool.connect();
  let claimed = false;
  let nextAvailabilityFailoverCheckAt = 0;
  let availabilityFailoverTask: Promise<void> | null = null;

  try {
    while (!claimed && !stopping) {
      const lockResult = await lockClient.query<{ claimed: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS claimed",
        ["kontamou:nova-order-reconciliation-worker"]
      );
      claimed = lockResult.rows[0]?.claimed === true;
      if (claimed) break;

      log("info", "nova.order_reconciliation_lock_wait", {
        workerId,
        retryMs,
        writesSupplierOrders: false
      });
      await delay(retryMs);
    }

    if (!claimed) {
      log("info", "nova.order_reconciliation_worker_stopped", {
        workerId,
        reason: "shutdown_before_lock_claim"
      });
      return;
    }

    log("info", "nova.order_reconciliation_worker_started", {
      workerId,
      pollMs,
      batchLimit,
      supplier: "nova_brandsgateway",
      writesSupplierOrders: false,
      runtimeInvariantsVerified: true,
      availabilityFailoverEnabled
    });

    while (!stopping) {
      try {
        if (
          availabilityFailoverEnabled
          && availabilityFailoverTask === null
          && Date.now() >= nextAvailabilityFailoverCheckAt
        ) {
          nextAvailabilityFailoverCheckAt = Date.now() + availabilityFailoverCheckMs;
          const health = await novaAvailabilityHealth(runtime);
          if (shouldRunAvailabilityFailover(health)) {
            log("warn", "nova.availability_failover_started", {
              workerId,
              ...health,
              reason: "catalogue_worker_availability_evidence_stale"
            });
            availabilityFailoverTask = runNovaAvailabilityRefreshSweep()
              .then((result) => {
                log("info", "nova.availability_failover_completed", {
                  workerId,
                  ...result
                });
              })
              .catch((error) => {
                log("error", "nova.availability_failover_failed", {
                  workerId,
                  error: safeError(error)
                });
              })
              .finally(() => {
                availabilityFailoverTask = null;
              });
          }
        }

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
    if (claimed) {
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
    }
    lockClient.release();
    await runtime.close();
    if (claimed) {
      log("info", "nova.order_reconciliation_worker_stopped", { workerId });
    }
  }
}

async function waitForDatabaseReadiness(): Promise<void> {
  const startedAt = Date.now();
  let attempt = 0;
  let lastMessage = "database readiness not checked";

  while (Date.now() - startedAt < databaseReadinessTimeoutMs) {
    attempt += 1;
    try {
      const readiness = await productionDatabaseReadiness();
      if (readiness.ok) {
        if (attempt > 1) {
          log("info", "nova.order_reconciliation_database_ready", {
            workerId,
            attempt,
            waitedMs: Date.now() - startedAt
          });
        }
        return;
      }
      lastMessage = readiness.message;
    } catch (error) {
      lastMessage = safeError(error);
    }

    log("warn", "nova.order_reconciliation_database_not_ready", {
      workerId,
      attempt,
      message: lastMessage,
      retryInMs: databaseReadinessRetryMs
    });

    const remainingMs = databaseReadinessTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    await delay(Math.min(databaseReadinessRetryMs, remainingMs));
  }

  throw new Error(
    `Nova order reconciliation worker refused to start after waiting for database readiness: ${lastMessage}`
  );
}

async function novaAvailabilityHealth(runtime: Runtime): Promise<AvailabilityHealth> {
  const result = await runtime.nativePool.query<{
    active_offers: string | number;
    fresh_evidence: string | number;
    newest_checked_at: Date | string | null;
  }>(`
    SELECT
      count(*) FILTER (WHERE dso.active=true)::bigint AS active_offers,
      count(*) FILTER (
        WHERE dso.active=true
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
      )::bigint AS fresh_evidence,
      max(dso.availability_checked_at) FILTER (WHERE dso.active=true) AS newest_checked_at
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    WHERE ds.code='nova_brandsgateway'
      AND ds.active=true
      AND ds.api_authoritative_availability=true
  `);

  const activeOffers = Number(result.rows[0]?.active_offers ?? 0);
  const freshEvidence = Number(result.rows[0]?.fresh_evidence ?? 0);
  const rawNewest = result.rows[0]?.newest_checked_at;
  const newestCheckedAt = rawNewest ? new Date(rawNewest).getTime() : null;
  const freshRatio = activeOffers > 0 ? freshEvidence / activeOffers : 1;

  return {
    activeOffers,
    freshEvidence,
    newestCheckedAt: Number.isFinite(newestCheckedAt) ? newestCheckedAt : null,
    freshRatio
  };
}

function shouldRunAvailabilityFailover(health: AvailabilityHealth): boolean {
  if (health.activeOffers < 1 || health.freshRatio >= 0.9) return false;
  if (health.newestCheckedAt === null) return true;
  return Date.now() - health.newestCheckedAt >= 10 * 60_000;
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

function log(level: "info" | "warn" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}
