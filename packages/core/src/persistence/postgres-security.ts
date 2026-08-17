import { randomUUID } from "node:crypto";
import type { SecurityEvent, SecurityEventType, SecuritySeverity } from "../security/events.ts";
import { PostgresUnitOfWork, type SqlPool, type SqlRow } from "./sql.ts";

function millis(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid security-event timestamp from database");
  return parsed;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function mapSecurityEvent(row: SqlRow): SecurityEvent {
  if (typeof row.public_id !== "string" || typeof row.event_type !== "string" || typeof row.severity !== "string") {
    throw new Error("Invalid security-event database row");
  }
  return {
    id: row.public_id,
    type: row.event_type as SecurityEventType,
    severity: row.severity as SecuritySeverity,
    requestId: text(row.request_id),
    route: text(row.route),
    method: text(row.method),
    subjectHash: text(row.subject_hash),
    actorUserId: text(row.actor_public_id),
    details: row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? row.details as Record<string, string | number | boolean | null>
      : undefined,
    occurredAt: millis(row.occurred_at)
  };
}

export class PostgresSecurityRepository {
  readonly #uow: PostgresUnitOfWork;
  readonly #retentionMs: number;

  constructor(pool: SqlPool, retentionMs = 90 * 24 * 60 * 60 * 1000) {
    if (!Number.isSafeInteger(retentionMs) || retentionMs <= 0) throw new Error("Security-event retention must be positive");
    this.#uow = new PostgresUnitOfWork(pool);
    this.#retentionMs = retentionMs;
  }

  async record(event: SecurityEvent): Promise<void> {
    await this.#uow.withTransaction({ actorUserId: event.actorUserId, requestId: event.requestId, platformAccess: true }, async (tx) => {
      let actorId: string | null = null;
      if (event.actorUserId) {
        const actor = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [event.actorUserId]);
        actorId = typeof actor.rows[0]?.id === "string" ? actor.rows[0].id : null;
      }
      await tx.query(`
        INSERT INTO security_events
          (id, public_id, event_type, severity, request_id, route, method, subject_hash,
           actor_user_id, actor_public_id, details, occurred_at, retention_until)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (public_id) DO NOTHING
      `, [randomUUID(), event.id, event.type, event.severity, event.requestId ?? null, event.route ?? null,
        event.method ?? null, event.subjectHash ?? null, actorId, event.actorUserId ?? null,
        event.details ?? {}, new Date(event.occurredAt), new Date(event.occurredAt + this.#retentionMs)]);
    });
  }

  async recent(input: { since?: number; type?: SecurityEventType; severity?: SecuritySeverity; limit?: number } = {}): Promise<readonly SecurityEvent[]> {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 1_000);
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT public_id, event_type, severity, request_id, route, method, subject_hash,
               actor_public_id, details, occurred_at
        FROM security_events
        WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
          AND ($2::text IS NULL OR event_type=$2)
          AND ($3::text IS NULL OR severity=$3)
        ORDER BY occurred_at DESC
        LIMIT $4
      `, [input.since === undefined ? null : new Date(input.since), input.type ?? null, input.severity ?? null, limit]);
      return result.rows.map(mapSecurityEvent);
    }, { readOnly: true });
  }

  async purgeExpired(now: number): Promise<number> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query("DELETE FROM security_events WHERE retention_until < $1", [new Date(now)]);
      return result.rowCount;
    });
  }
}
