import { randomUUID } from "node:crypto";
import type { Notification, NotificationCenterGroup, NotificationDeliveryAttempt, NotificationPreference, NotificationTemplate } from "../notifications/types.ts";
import { notificationCenterGroup } from "../notifications/service.ts";
import type { NotificationDeliveryAttemptSink, NotificationDeliveryStore } from "../notifications/delivery.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

function millis(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function mapNotification(row: SqlRow): Notification {
  return {
    id: requiredString(row.public_id, "public_id"),
    userId: typeof row.user_public_id === "string" ? row.user_public_id : undefined,
    vendorId: typeof row.vendor_public_id === "string" ? row.vendor_public_id : undefined,
    channel: requiredString(row.channel, "channel") as Notification["channel"],
    purpose: requiredString(row.purpose, "purpose") as Notification["purpose"],
    eventType: requiredString(row.event_type, "event_type"),
    templateVersion: requiredString(row.template_version, "template_version"),
    locale: requiredString(row.locale, "locale") as "el" | "en",
    title: requiredString(row.title, "title"),
    body: requiredString(row.body, "body"),
    payload: (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<string, unknown>,
    status: requiredString(row.status, "status") as Notification["status"],
    dedupeKey: typeof row.dedupe_key === "string" ? row.dedupe_key : undefined,
    providerMessageId: typeof row.provider_message_id === "string" ? row.provider_message_id : undefined,
    sentAt: millis(row.sent_at), failedAt: millis(row.failed_at), readAt: millis(row.read_at), archivedAt: millis(row.archived_at),
    deliveryAttempts: Number(row.delivery_attempts ?? 0), nextAttemptAt: millis(row.next_attempt_at),
    deliveryLeaseOwner: typeof row.delivery_lease_owner === "string" ? row.delivery_lease_owner : undefined,
    deliveryLeaseUntil: millis(row.delivery_lease_until), lastDeliveryError: typeof row.last_delivery_error === "string" ? row.last_delivery_error : undefined,
    createdAt: millis(row.created_at) ?? 0
  };
}

const NOTIFICATION_SELECT = `
  SELECT n.*, u.public_id AS user_public_id, v.public_id AS vendor_public_id
  FROM notifications n
  LEFT JOIN users u ON u.id=n.user_id
  LEFT JOIN vendor_businesses v ON v.id=n.vendor_id
`;

async function actorUuid(tx: SqlExecutor, actorPublicId: string): Promise<string | null> {
  const result = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [actorPublicId]);
  return typeof result.rows[0]?.id === "string" ? result.rows[0].id : null;
}

async function targetUuid(tx: SqlExecutor, table: "users" | "vendor_businesses", publicId: string): Promise<string> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE public_id=$1 OR id::text=$1`, [publicId]);
  return requiredString(requireSingleRow(result, `${table} target ${publicId} was not found`).id, "id");
}

export class PostgresNotificationOperationsRepository implements NotificationDeliveryStore, NotificationDeliveryAttemptSink {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async saveTemplate(input: { scope: DatabaseScope; template: NotificationTemplate }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const creator = await actorUuid(tx, input.template.createdBy);
      await tx.query(`
        INSERT INTO notification_templates
          (id, public_id, event_type, channel, locale, purpose, revision, title_template, body_template, required, active, created_by, created_by_public_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (public_id) DO NOTHING
      `, [randomUUID(), input.template.id, input.template.eventType, input.template.channel, input.template.locale, input.template.purpose,
        input.template.revision, input.template.titleTemplate, input.template.bodyTemplate, input.template.required, input.template.active,
        creator, input.template.createdBy, new Date(input.template.createdAt)]);
    });
  }

  async savePreference(input: { scope: DatabaseScope; preference: NotificationPreference }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const userId = input.preference.targetType === "user" ? await targetUuid(tx, "users", input.preference.targetId) : null;
      const vendorId = input.preference.targetType === "vendor" ? await targetUuid(tx, "vendor_businesses", input.preference.targetId) : null;
      await tx.query(`
        INSERT INTO notification_preferences (id, public_id, user_id, vendor_id, channel, event_type, enabled, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (public_id) DO UPDATE SET enabled=EXCLUDED.enabled, updated_at=EXCLUDED.updated_at
      `, [randomUUID(), input.preference.id, userId, vendorId, input.preference.channel, input.preference.eventType, input.preference.enabled, new Date(input.preference.updatedAt)]);
    });
  }

  async claimQueued(input: { now: number; ownerId: string; leaseMs: number; limit: number; channels?: readonly Exclude<Notification["channel"], "in_app">[] }): Promise<readonly Notification[]> {
    return this.#uow.withTransaction({ platformAccess: true, requestId: input.ownerId }, async (tx) => {
      const result = await tx.query<SqlRow>(`
        WITH due AS (
          SELECT id FROM notifications
          WHERE channel <> 'in_app'
            AND status='queued'
            AND ($5::text[] IS NULL OR channel = ANY($5::text[]))
            AND COALESCE(next_attempt_at, created_at) <= $1
            AND COALESCE(delivery_lease_until, to_timestamp(0)) <= $1
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $2
        ), claimed AS (
          UPDATE notifications n
          SET status='sending', delivery_lease_owner=$3, delivery_lease_until=$1 + ($4::bigint * interval '1 millisecond')
          FROM due WHERE n.id=due.id
          RETURNING n.id
        )
        ${NOTIFICATION_SELECT}
        WHERE n.id IN (SELECT id FROM claimed)
        ORDER BY n.created_at
      `, [new Date(input.now), input.limit, input.ownerId, input.leaseMs, input.channels?.length ? [...input.channels] : null]);
      return result.rows.map(mapNotification);
    });
  }

  async completeDelivery(input: { id: string; ownerId: string; providerMessageId: string; now: number }): Promise<Notification> {
    return this.#uow.withTransaction({ platformAccess: true, requestId: input.ownerId }, async (tx) => {
      const updated = await tx.query<SqlRow>(`
        UPDATE notifications SET status='sent', delivery_attempts=delivery_attempts+1, provider_message_id=$3, sent_at=$2,
          failed_at=NULL, last_delivery_error=NULL, next_attempt_at=NULL, delivery_lease_owner=NULL, delivery_lease_until=NULL
        WHERE public_id=$1 AND status='sending' AND delivery_lease_owner=$4 AND delivery_lease_until >= $2
        RETURNING id
      `, [input.id, new Date(input.now), input.providerMessageId, input.ownerId]);
      const row = requireSingleRow(updated, "Notification delivery lease was lost");
      const result = await tx.query<SqlRow>(`${NOTIFICATION_SELECT} WHERE n.id=$1`, [row.id]);
      return mapNotification(requireSingleRow(result));
    });
  }

  async failDelivery(input: { id: string; ownerId: string; error: string; now: number; terminal: boolean; retryDelayMs: number }): Promise<Notification> {
    return this.#uow.withTransaction({ platformAccess: true, requestId: input.ownerId }, async (tx) => {
      const updated = await tx.query<SqlRow>(`
        UPDATE notifications SET status=CASE WHEN $5 THEN 'failed' ELSE 'queued' END, delivery_attempts=delivery_attempts+1,
          failed_at=$2, last_delivery_error=$3, next_attempt_at=CASE WHEN $5 THEN NULL ELSE $2 + ($6::bigint * interval '1 millisecond') END,
          delivery_lease_owner=NULL, delivery_lease_until=NULL
        WHERE public_id=$1 AND status='sending' AND delivery_lease_owner=$4 AND delivery_lease_until >= $2
        RETURNING id
      `, [input.id, new Date(input.now), input.error, input.ownerId, input.terminal, input.retryDelayMs]);
      const row = requireSingleRow(updated, "Notification delivery lease was lost");
      const result = await tx.query<SqlRow>(`${NOTIFICATION_SELECT} WHERE n.id=$1`, [row.id]);
      return mapNotification(requireSingleRow(result));
    });
  }

  async requeue(id: string, now: number): Promise<Notification> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const updated = await tx.query<SqlRow>(`
        UPDATE notifications SET status='queued', next_attempt_at=$2, failed_at=NULL, last_delivery_error=NULL, delivery_lease_owner=NULL, delivery_lease_until=NULL
        WHERE public_id=$1 AND channel <> 'in_app' AND status='failed'
        RETURNING id
      `, [id, new Date(now)]);
      const row = requireSingleRow(updated, "Only a failed external notification can be requeued");
      const result = await tx.query<SqlRow>(`${NOTIFICATION_SELECT} WHERE n.id=$1`, [row.id]);
      return mapNotification(requireSingleRow(result));
    });
  }

  async recordAttempt(attempt: NotificationDeliveryAttempt): Promise<void> {
    await this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const notification = await tx.query<SqlRow>("SELECT id::text AS id FROM notifications WHERE public_id=$1", [attempt.notificationId]);
      const notificationId = requiredString(requireSingleRow(notification, "Notification not found for delivery attempt").id, "id");
      await tx.query(`
        INSERT INTO notification_delivery_attempts
          (id, public_id, notification_id, attempt, channel, provider, status, masked_destination, provider_message_id, error, started_at, completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (notification_id, attempt) DO NOTHING
      `, [randomUUID(), attempt.id, notificationId, attempt.attempt, attempt.channel, attempt.provider, attempt.status, attempt.maskedDestination,
        attempt.providerMessageId ?? null, attempt.error ?? null, new Date(attempt.startedAt), new Date(attempt.completedAt)]);
    });
  }

  async centerForUser(input: { scope: DatabaseScope; userId: string; group?: NotificationCenterGroup; unreadOnly?: boolean; includeArchived?: boolean }): Promise<ReadonlyArray<Notification & { group: NotificationCenterGroup }>> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const userId = await targetUuid(tx, "users", input.userId);
      const result = await tx.query<SqlRow>(`${NOTIFICATION_SELECT} WHERE n.user_id=$1 AND n.channel='in_app' ORDER BY n.created_at DESC`, [userId]);
      return result.rows.map(mapNotification)
        .filter((item) => input.includeArchived || !item.archivedAt)
        .filter((item) => !input.unreadOnly || !item.readAt)
        .map((item) => ({ ...item, group: notificationCenterGroup(item.eventType) }))
        .filter((item) => !input.group || item.group === input.group);
    }, { readOnly: true });
  }

  async markAllRead(input: { scope: DatabaseScope; userId: string; group?: NotificationCenterGroup; now: number }): Promise<number> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const userId = await targetUuid(tx, "users", input.userId);
      const result = await tx.query<SqlRow>(`${NOTIFICATION_SELECT} WHERE n.user_id=$1 AND n.channel='in_app' AND n.read_at IS NULL AND n.archived_at IS NULL`, [userId]);
      const ids = result.rows.map(mapNotification).filter((item) => !input.group || notificationCenterGroup(item.eventType) === input.group).map((item) => item.id);
      let updated = 0;
      for (const publicId of ids) {
        const change = await tx.query("UPDATE notifications SET read_at=$3 WHERE public_id=$1 AND user_id=$2 AND read_at IS NULL", [publicId, userId, new Date(input.now)]);
        updated += change.rowCount;
      }
      return updated;
    });
  }

  async archiveForUser(input: { scope: DatabaseScope; userId: string; notificationId: string; now: number }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const userId = await targetUuid(tx, "users", input.userId);
      const result = await tx.query("UPDATE notifications SET archived_at=$3,read_at=COALESCE(read_at,$3) WHERE public_id=$1 AND user_id=$2 AND channel='in_app' AND archived_at IS NULL", [input.notificationId, userId, new Date(input.now)]);
      if (result.rowCount !== 1) throw new Error("Notification not found or not archivable by this user");
    });
  }

}
