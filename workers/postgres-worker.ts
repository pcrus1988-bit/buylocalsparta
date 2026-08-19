import { hostname } from "node:os";
import { ScheduledJobRunner } from "../packages/core/src/index.ts";
import { createPostgresRuntimeFromEnv, EXPECTED_SCHEMA_VERSION, FiscalWorkError } from "../packages/postgres-runtime/src/index.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-worker" });
const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
if (!readiness.ok) {
  await runtime.close();
  throw new Error(`PostgreSQL worker refused to start: ${readiness.message}`);
}

const ownerId = process.env.BLS_WORKER_ID?.trim() || `postgres-worker:${hostname()}:${process.pid}`;
const pollMs = positiveInteger(process.env.BLS_WORKER_POLL_MS, 5_000, "BLS_WORKER_POLL_MS");
const runner = new ScheduledJobRunner({ store: runtime.persistence.scheduledJobs, ownerId, leaseMs: 60_000 });

runner.register({
  name: "inventory.reservation_expiry",
  intervalMs: 60_000,
  retryMs: 10_000,
  run: async (now) => {
    const expired = await runtime.persistence.inventory.expireReservations({ now, limit: 1_000 });
    const abandoned = await runtime.nativePool.query<{ expired: number }>("SELECT expire_pending_payment_orders($1,$2) AS expired", [new Date(now), 1_000]);
    log("info", "worker.inventory_reservation_expiry", { expired, pendingPaymentOrdersCancelled: Number(abandoned.rows[0]?.expired ?? 0) });
  }
});

runner.register({
  name: "payments.viva_reconciliation_watch",
  intervalMs: 5 * 60 * 1_000,
  retryMs: 60_000,
  run: async (now) => {
    const cutoff = new Date(now - 10 * 60 * 1_000);
    const staleOrders = await runtime.nativePool.query(
      `UPDATE payments
       SET provider_payload=provider_payload||jsonb_build_object(
         'orderCreationState','manual_review',
         'orderCreationWatchdogAt',$2::text,
         'orderCreationWatchdogReason','creation_attempt_stale'
       ),updated_at=$2
       WHERE provider='viva' AND provider_order_code IS NULL
         AND provider_payload->>'orderCreationState'='creating' AND updated_at<$1`,
      [cutoff, new Date(now)]
    );
    const staleRefunds = await runtime.nativePool.query(
      `UPDATE refunds SET status='manual_review',failure_code='provider_outcome_unknown',
         failure_message=COALESCE(failure_message,'Viva refund attempt became stale before a definitive provider outcome'),updated_at=$2
       WHERE status='processing' AND updated_at<$1`,
      [cutoff, new Date(now)]
    );
    log("info", "worker.viva_reconciliation_watch", { stalePaymentOrders: staleOrders.rowCount ?? 0, staleRefunds: staleRefunds.rowCount ?? 0 });
  }
});

runner.register({
  name: "retention.security_events",
  intervalMs: 24 * 60 * 60 * 1_000,
  retryMs: 15 * 60 * 1_000,
  run: async (now) => {
    const deleted = await runtime.persistence.security.purgeExpired(now);
    log("info", "worker.security_retention", { deleted });
  }
});

runner.register({
  name: "retention.analytics_events",
  intervalMs: 24 * 60 * 60 * 1_000,
  retryMs: 15 * 60 * 1_000,
  run: async (now) => {
    const deleted = await runtime.persistence.analytics.purgeExpired({ scope: { marketId: "sparta", platformAccess: true }, now });
    log("info", "worker.analytics_retention", { deleted });
  }
});

runner.register({
  name: "retention.auth_rate_limits",
  intervalMs: 24 * 60 * 60 * 1_000,
  retryMs: 15 * 60 * 1_000,
  run: async (now) => {
    const deleted = await runtime.nativePool.query(
      "DELETE FROM auth_rate_limit_windows WHERE updated_at < $1",
      [new Date(now - 7 * 24 * 60 * 60 * 1_000)]
    );
    log("info", "worker.auth_rate_limit_retention", { deleted: deleted.rowCount ?? 0 });
  }
});

let stopping = false;
const stop = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  log("info", "worker.shutdown", { signal });
  await runtime.close();
};
process.once("SIGTERM", () => { void stop("SIGTERM"); });
process.once("SIGINT", () => { void stop("SIGINT"); });

log("info", "worker.started", { ownerId, pollMs, schema: readiness.appliedSchemaVersion });
while (!stopping) {
  const now = Date.now();
  const fiscal = await processFiscalOutbox(now);
  if (fiscal.claimed || fiscal.failed || fiscal.deadLettered) log("info", "worker.fiscal_tick", fiscal);
  const result = await runner.runDue(now, 10);
  if (result.claimed || result.failed.length) log("info", "worker.scheduler_tick", result);
  await delay(pollMs);
}

async function processFiscalOutbox(now: number): Promise<{ claimed: number; completed: number; failed: number; deadLettered: number }> {
  const events = await runtime.persistence.outbox.claim(now, 20, 60_000, ["fiscal.order_paid"], ownerId);
  let completed = 0;
  let failed = 0;
  let deadLettered = 0;
  for (const event of events) {
    try {
      const payload = object(event.payload);
      const orderId = requiredText(payload.orderId ?? event.aggregateId, "orderId");
      const paymentId = requiredText(payload.paymentId, "paymentId");
      const eventCapturedMinor = optionalInteger(payload.capturedMinor, "capturedMinor");
      const eventCurrency = optionalText(payload.currency);
      const document = await runtime.fiscalWork.materializePaidOrder({ orderId, paymentId, eventCapturedMinor, eventCurrency, now });
      await runtime.persistence.outbox.complete(event.id, Date.now(), ownerId);
      completed += 1;
      log("info", "worker.fiscal_order_materialized", { eventId: event.id, orderId, documentId: document.documentId, documentType: document.documentType, created: document.created });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof FiscalWorkError ? error.retryable : true;
      if (!retryable || event.attempts >= 5) {
        await runtime.persistence.outbox.deadLetter(event.id, message, Date.now(), ownerId);
        deadLettered += 1;
        log("error", "worker.fiscal_order_dead_lettered", { eventId: event.id, orderId: event.aggregateId, attempts: event.attempts, message });
      } else {
        const retryDelayMs = Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, event.attempts - 1));
        await runtime.persistence.outbox.fail(event.id, message, Date.now(), retryDelayMs, ownerId);
        failed += 1;
        log("error", "worker.fiscal_order_retry", { eventId: event.id, orderId: event.aggregateId, attempts: event.attempts, retryDelayMs, message });
      }
    }
  }
  return { claimed: events.length, completed, failed, deadLettered };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new FiscalWorkError(`Fiscal outbox event is missing ${label}`);
  return value.trim();
}
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function optionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new FiscalWorkError(`Fiscal outbox event has invalid ${label}`);
  return parsed;
}
function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function delay(ms: number) { return new Promise<void>((resolve) => setTimeout(resolve, ms)); }
function log(level: "info" | "error", event: string, details: Record<string, unknown>) {
  console[level](JSON.stringify({ level, event, at: new Date().toISOString(), ...details }));
}
