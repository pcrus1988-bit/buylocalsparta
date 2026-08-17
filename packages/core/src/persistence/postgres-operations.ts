import { randomUUID } from "node:crypto";
import { id as publicId } from "../common/ids.ts";
import type { OutboxEvent, OutboxStore } from "../common/outbox.ts";
import type { ScheduledJobLease, ScheduledJobStore } from "../jobs/scheduler.ts";
import type { SearchProjectionResult } from "../search/indexing.ts";
import type { StockFreshnessState } from "../inventory/freshness.ts";
import { PostgresUnitOfWork, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

function epoch(value: unknown, field: string): number {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value as string | number).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`Database field ${field} is not a timestamp`);
  return parsed;
}

function optionalEpoch(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  return epoch(value, "timestamp");
}

function jsonValue(value: unknown): unknown {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function outboxRow(row: SqlRow): OutboxEvent {
  return {
    id: String(row.public_id ?? row.id),
    type: String(row.event_type),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_public_id ?? row.aggregate_id ?? ""),
    payload: jsonValue(row.payload),
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as OutboxEvent["status"],
    attempts: Number(row.attempts),
    availableAt: epoch(row.available_at, "available_at"),
    lockedUntil: optionalEpoch(row.locked_until),
    lockOwner: row.lock_owner ? String(row.lock_owner) : undefined,
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdAt: epoch(row.created_at, "created_at"),
    processedAt: optionalEpoch(row.processed_at)
  };
}

/** PostgreSQL implementation of durable transactional-outbox worker leasing. */
export class PostgresOutboxRepository implements OutboxStore {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async enqueue<T>(input: { type: string; aggregateType: string; aggregateId: string; payload: T; idempotencyKey: string; now: number; availableAt?: number }): Promise<OutboxEvent<T>> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`INSERT INTO outbox_events
        (id, public_id, aggregate_type, aggregate_id, aggregate_public_id, event_type, payload, idempotency_key, status, available_at, attempts, created_at)
        VALUES ($1,$2,$3,NULL,$4,$5,$6::jsonb,$7,'pending',$8,0,$9)
        ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
        RETURNING *`, [randomUUID(), publicId("evt"), input.aggregateType, input.aggregateId, input.type, JSON.stringify(input.payload), input.idempotencyKey, new Date(input.availableAt ?? input.now), new Date(input.now)]);
      if (result.rowCount !== 1) throw new Error("Failed to enqueue outbox event");
      return outboxRow(result.rows[0]) as OutboxEvent<T>;
    });
  }

  async claim(now: number, limit = 20, leaseMs = 30_000, eventTypes?: readonly string[], ownerId = "postgres-worker"): Promise<readonly OutboxEvent[]> {
    if (!ownerId.trim()) throw new Error("Outbox lease owner is required");
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`WITH candidates AS (
        SELECT id FROM outbox_events
        WHERE event_type = ANY($1::text[])
          AND available_at <= $2
          AND (status IN ('pending','failed') OR (status='processing' AND COALESCE(locked_until, '-infinity'::timestamptz) <= $2))
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT $3
      )
      UPDATE outbox_events e
      SET status='processing', attempts=e.attempts+1,
          locked_until=$2 + ($4::bigint * interval '1 millisecond'), lock_owner=$5, last_error=NULL
      FROM candidates c WHERE e.id=c.id
      RETURNING e.*`, [eventTypes?.length ? [...eventTypes] : ["__none__"], new Date(now), limit, leaseMs, ownerId]);
      return result.rows.map(outboxRow);
    });
  }

  complete(eventId: string, now: number, ownerId?: string): Promise<OutboxEvent> {
    return this.#finish(eventId, ownerId, `status='processed', processed_at=$2, locked_until=NULL, lock_owner=NULL`, [new Date(now)]);
  }

  fail(eventId: string, error: string, now: number, retryDelayMs = 5_000, ownerId?: string): Promise<OutboxEvent> {
    return this.#finish(eventId, ownerId, `status='failed', last_error=$2, available_at=$3 + ($4::bigint * interval '1 millisecond'), locked_until=NULL, lock_owner=NULL`, [error.slice(0, 2_000), new Date(now), retryDelayMs]);
  }

  deadLetter(eventId: string, error: string, now: number, ownerId?: string): Promise<OutboxEvent> {
    return this.#finish(eventId, ownerId, `status='dead_lettered', last_error=$2, processed_at=$3, dead_lettered_at=$3, locked_until=NULL, lock_owner=NULL`, [error.slice(0, 2_000), new Date(now)]);
  }

  async replay(eventId: string, now: number): Promise<OutboxEvent> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`UPDATE outbox_events SET status='pending', available_at=$2, processed_at=NULL, dead_lettered_at=NULL, locked_until=NULL, lock_owner=NULL, last_error=NULL
        WHERE (public_id=$1 OR id::text=$1) AND status IN ('failed','dead_lettered') RETURNING *`, [eventId, new Date(now)]);
      if (result.rowCount !== 1) throw new Error("Outbox event is not replayable");
      return outboxRow(result.rows[0]);
    });
  }

  async #finish(eventId: string, ownerId: string | undefined, assignment: string, values: readonly unknown[]): Promise<OutboxEvent> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const params: unknown[] = [eventId, ...values, ownerId ?? null];
      const ownerParam = params.length;
      const result = await tx.query<SqlRow>(`UPDATE outbox_events SET ${assignment}
        WHERE (public_id=$1 OR id::text=$1) AND status='processing' AND ($${ownerParam}::text IS NULL OR lock_owner=$${ownerParam}) RETURNING *`, params);
      if (result.rowCount !== 1) throw new Error("Outbox event lease is no longer owned by this worker");
      return outboxRow(result.rows[0]);
    });
  }
}

export class PostgresScheduledJobStore implements ScheduledJobStore {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async claimDue(input: { now: number; ownerId: string; jobNames: readonly string[]; leaseMs: number; limit: number }): Promise<readonly ScheduledJobLease[]> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      await tx.query(`INSERT INTO scheduled_jobs (name, next_run_at) SELECT name, to_timestamp(0) FROM unnest($1::text[]) AS name ON CONFLICT (name) DO NOTHING`, [[...input.jobNames]]);
      const result = await tx.query<SqlRow>(`WITH due AS (
        SELECT name FROM scheduled_jobs
        WHERE name = ANY($1::text[]) AND next_run_at <= $2 AND COALESCE(locked_until, '-infinity'::timestamptz) <= $2
        ORDER BY next_run_at, name FOR UPDATE SKIP LOCKED LIMIT $3
      ) UPDATE scheduled_jobs j SET lock_owner=$4, locked_until=$2 + ($5::bigint * interval '1 millisecond'), last_started_at=$2
        FROM due WHERE j.name=due.name RETURNING j.*`, [[...input.jobNames], new Date(input.now), input.limit, input.ownerId, input.leaseMs]);
      return result.rows.map(jobRow);
    });
  }

  complete(input: { name: string; ownerId: string; now: number; nextRunAt: number }): Promise<void> {
    return this.#update(input.name, input.ownerId, `next_run_at=$3,last_succeeded_at=$2,locked_until=NULL,lock_owner=NULL,consecutive_failures=0,last_error=NULL`, [new Date(input.now), new Date(input.nextRunAt)]);
  }

  fail(input: { name: string; ownerId: string; now: number; nextRunAt: number; error: string }): Promise<void> {
    return this.#update(input.name, input.ownerId, `next_run_at=$3,locked_until=NULL,lock_owner=NULL,consecutive_failures=consecutive_failures+1,last_error=$4`, [new Date(input.now), new Date(input.nextRunAt), input.error.slice(0, 2_000)]);
  }

  async #update(name: string, ownerId: string, assignment: string, values: readonly unknown[]): Promise<void> {
    await this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query(`UPDATE scheduled_jobs SET ${assignment} WHERE name=$1 AND lock_owner=$${values.length + 2}`, [name, ...values, ownerId]);
      if (result.rowCount !== 1) throw new Error("Scheduled job lease is no longer owned by this worker");
    });
  }
}

function jobRow(row: SqlRow): ScheduledJobLease {
  return {
    name: String(row.name), ownerId: String(row.lock_owner), lockedUntil: epoch(row.locked_until, "locked_until"), nextRunAt: epoch(row.next_run_at, "next_run_at"),
    lastStartedAt: optionalEpoch(row.last_started_at), lastSucceededAt: optionalEpoch(row.last_succeeded_at), consecutiveFailures: Number(row.consecutive_failures ?? 0), lastError: row.last_error ? String(row.last_error) : undefined
  };
}

export class PostgresSearchProjectionRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async record(input: { marketId: string; entityType: string; entityId: string; result: SearchProjectionResult; now: number; error?: string }): Promise<void> {
    await this.#uow.withTransaction({ marketId: input.marketId, platformAccess: true }, async (tx) => {
      const market = await resolveMarket(tx, input.marketId);
      const status = input.error ? "failed" : input.result.action === "removed" ? "removed" : "indexed";
      await tx.query(`INSERT INTO search_index_state (market_id,entity_type,entity_public_id,document_hash,status,indexed_at,last_error,version,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,1,$6)
        ON CONFLICT (market_id,entity_type,entity_public_id) DO UPDATE SET document_hash=EXCLUDED.document_hash,status=EXCLUDED.status,indexed_at=EXCLUDED.indexed_at,last_error=EXCLUDED.last_error,version=search_index_state.version+1,updated_at=EXCLUDED.updated_at`,
        [market, input.entityType, input.entityId, input.result.documentHash ?? null, status, new Date(input.now), input.error ?? null]);
    });
  }
}

export class PostgresStockFreshnessRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async confirm(input: { offerId: string; vendorId?: string; confirmedAt: number; ttlMs: number; source?: string }): Promise<void> {
    await this.#uow.withTransaction({ vendorId: input.vendorId, platformAccess: !input.vendorId }, async (tx) => {
      const offer = await resolvePublicId(tx, "vendor_offers", input.offerId);
      await tx.query(`UPDATE inventory_balances SET stock_confirmed_at=$2,freshness_ttl_seconds=$3,freshness_status='fresh',source=COALESCE($4,source),updated_at=$2 WHERE offer_id=$1`, [offer, new Date(input.confirmedAt), Math.ceil(input.ttlMs / 1000), input.source ?? null]);
    });
  }

  async markStatus(input: { offerId: string; status: StockFreshnessState; now: number }): Promise<void> {
    await this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const offer = await resolvePublicId(tx, "vendor_offers", input.offerId);
      await tx.query(`UPDATE inventory_balances SET freshness_status=$2,updated_at=GREATEST(updated_at,$3) WHERE offer_id=$1`, [offer, input.status, new Date(input.now)]);
    });
  }
}

async function resolvePublicId(tx: SqlExecutor, table: string, value: string): Promise<string> {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Unsafe table identifier");
  const result = await tx.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [value]);
  if (result.rowCount !== 1) throw new Error(`${table} record not found`);
  return String(result.rows[0].id);
}

async function resolveMarket(tx: SqlExecutor, value: string): Promise<string> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS id FROM markets WHERE code=$1 OR id::text=$1 LIMIT 1`, [value]);
  if (result.rowCount !== 1) throw new Error("Market not found");
  return String(result.rows[0].id);
}
