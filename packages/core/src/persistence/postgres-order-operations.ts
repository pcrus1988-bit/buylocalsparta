import { randomUUID } from "node:crypto";
import type { FulfilmentSlaCase, OrderCancellation, OrderTimelineEvent, SubstitutionRequest } from "../fulfilment/operations.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

const ALLOWED_TABLES = new Set(["customer_orders", "fulfilment_orders", "order_lines", "vendor_businesses", "users", "canonical_variants", "vendor_offers", "stock_reservations", "fulfilment_sla_cases", "order_substitution_requests"]);

async function resolveId(db: SqlExecutor, table: string, publicId: string): Promise<string> {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Unsupported order operations persistence table ${table}`);
  const result = await db.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE public_id=$1 OR id::text=$1`, [publicId]);
  return String(requireSingleRow(result, `${table} record ${publicId} was not found`).id);
}

function optionalEpoch(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid order operations timestamp from database");
  return parsed;
}

export class PostgresOrderOperationsRepository {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
  }

  async appendTimeline(input: { scope: DatabaseScope; event: OrderTimelineEvent; vendorId?: string }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, actorUserId: input.event.actorId, platformAccess: true }, async (tx) => {
      const orderId = await resolveId(tx, "customer_orders", input.event.orderId);
      const fulfilmentId = input.event.fulfilmentId ? await resolveId(tx, "fulfilment_orders", input.event.fulfilmentId) : null;
      const lineId = input.event.lineId ? await resolveId(tx, "order_lines", input.event.lineId) : null;
      const vendorId = input.vendorId ? await resolveId(tx, "vendor_businesses", input.vendorId) : null;
      const actorResult = input.event.actorId ? await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [input.event.actorId]) : { rowCount: 0, rows: [] };
      const actorId = actorResult.rowCount === 1 ? String(actorResult.rows[0].id) : null;
      await tx.query(`INSERT INTO order_timeline_events
        (id,public_id,order_id,fulfilment_order_id,order_line_id,vendor_id,event_type,actor_type,actor_user_id,actor_public_id,customer_visible,message,metadata,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (public_id) DO NOTHING`,
        [randomUUID(), input.event.id, orderId, fulfilmentId, lineId, vendorId, input.event.type, input.event.actorType, actorId, input.event.actorId ?? null,
          input.event.customerVisible, input.event.message, input.event.metadata ?? {}, new Date(input.event.createdAt)]);
    });
  }

  async saveCancellation(input: { scope: DatabaseScope; cancellation: OrderCancellation }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, actorUserId: input.cancellation.customerId, platformAccess: false }, async (tx) => {
      const orderId = await resolveId(tx, "customer_orders", input.cancellation.orderId);
      const customerId = await resolveId(tx, "users", input.cancellation.customerId);
      await tx.query(`INSERT INTO order_cancellations
        (id,public_id,order_id,customer_id,reason,status,payment_outcome,created_at,completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (order_id) DO NOTHING`,
        [randomUUID(), input.cancellation.id, orderId, customerId, input.cancellation.reason, input.cancellation.status, input.cancellation.paymentOutcome,
          new Date(input.cancellation.createdAt), new Date(input.cancellation.completedAt)]);
    });
  }

  async saveSubstitutionProposal(input: { scope: DatabaseScope; substitution: SubstitutionRequest }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, vendorId: input.substitution.vendorId, platformAccess: false }, async (tx) => {
      const orderId = await resolveId(tx, "customer_orders", input.substitution.orderId);
      const lineId = await resolveId(tx, "order_lines", input.substitution.lineId);
      const customerId = await resolveId(tx, "users", input.substitution.customerId);
      const vendorId = await resolveId(tx, "vendor_businesses", input.substitution.vendorId);
      const originalVariantId = await resolveId(tx, "canonical_variants", input.substitution.originalCanonicalVariantId);
      const proposedVariantId = await resolveId(tx, "canonical_variants", input.substitution.proposedCanonicalVariantId);
      const offerId = await resolveId(tx, "vendor_offers", input.substitution.proposedOfferId);
      const reservationId = await resolveId(tx, "stock_reservations", input.substitution.proposedReservationId);
      await tx.query(`INSERT INTO order_substitution_requests
        (id,public_id,order_id,order_line_id,customer_id,vendor_id,original_canonical_variant_id,proposed_canonical_variant_id,proposed_offer_id,proposed_reservation_id,
         currency,original_retail_unit_minor,proposed_retail_unit_minor,proposed_title,reason,status,created_at,expires_at,decided_at,decision_reason,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT (public_id) DO NOTHING`,
        [randomUUID(), input.substitution.id, orderId, lineId, customerId, vendorId, originalVariantId, proposedVariantId, offerId, reservationId,
          input.substitution.proposedRetailUnitPrice.currency, input.substitution.originalRetailUnitPrice.minor, input.substitution.proposedRetailUnitPrice.minor,
          input.substitution.proposedTitle, input.substitution.reason, input.substitution.status, new Date(input.substitution.createdAt), new Date(input.substitution.expiresAt),
          input.substitution.decidedAt ? new Date(input.substitution.decidedAt) : null, input.substitution.decisionReason ?? null, new Date(input.substitution.decidedAt ?? input.substitution.createdAt)]);
    });
  }

  async saveSubstitutionDecision(input: { scope: DatabaseScope; substitution: SubstitutionRequest }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, actorUserId: input.substitution.customerId, platformAccess: false }, async (tx) => {
      const substitutionId = await resolveId(tx, "order_substitution_requests", input.substitution.id);
      await tx.query(`UPDATE order_substitution_requests SET status=$1,decision_reason=$2,decided_at=$3,updated_at=$4 WHERE id=$5`,
        [input.substitution.status, input.substitution.decisionReason ?? null, input.substitution.decidedAt ? new Date(input.substitution.decidedAt) : null,
          new Date(input.substitution.decidedAt ?? input.substitution.createdAt), substitutionId]);
    });
  }

  async upsertSlaCase(input: { scope: DatabaseScope; slaCase: FulfilmentSlaCase }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, platformAccess: true }, async (tx) => {
      const orderId = await resolveId(tx, "customer_orders", input.slaCase.orderId);
      const fulfilmentId = await resolveId(tx, "fulfilment_orders", input.slaCase.fulfilmentId);
      const vendorId = await resolveId(tx, "vendor_businesses", input.slaCase.vendorId);
      await tx.query(`INSERT INTO fulfilment_sla_cases
        (id,public_id,order_id,fulfilment_order_id,vendor_id,stage,state,opened_at,due_at,escalation_at,breached_at,escalated_at,resolved_at,resolution,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (public_id) DO UPDATE SET state=EXCLUDED.state,breached_at=EXCLUDED.breached_at,escalated_at=EXCLUDED.escalated_at,
          resolved_at=EXCLUDED.resolved_at,resolution=EXCLUDED.resolution,updated_at=EXCLUDED.updated_at`,
        [randomUUID(), input.slaCase.id, orderId, fulfilmentId, vendorId, input.slaCase.stage, input.slaCase.state, new Date(input.slaCase.openedAt),
          new Date(input.slaCase.dueAt), new Date(input.slaCase.escalationAt), input.slaCase.breachedAt ? new Date(input.slaCase.breachedAt) : null,
          input.slaCase.escalatedAt ? new Date(input.slaCase.escalatedAt) : null, input.slaCase.resolvedAt ? new Date(input.slaCase.resolvedAt) : null,
          input.slaCase.resolution ?? null, new Date(input.slaCase.resolvedAt ?? input.slaCase.escalatedAt ?? input.slaCase.breachedAt ?? input.slaCase.openedAt)]);
    });
  }

  async listSla(input: { scope: DatabaseScope; vendorId?: string; activeOnly?: boolean }): Promise<readonly FulfilmentSlaCase[]> {
    return this.#uow.withTransaction(input.vendorId ? { ...input.scope, vendorId: input.vendorId, platformAccess: false } : { ...input.scope, platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT s.public_id,o.public_id AS order_public_id,f.public_id AS fulfilment_public_id,v.public_id AS vendor_public_id,
        s.stage,s.state,s.opened_at,s.due_at,s.escalation_at,s.breached_at,s.escalated_at,s.resolved_at,s.resolution
        FROM fulfilment_sla_cases s JOIN customer_orders o ON o.id=s.order_id JOIN fulfilment_orders f ON f.id=s.fulfilment_order_id JOIN vendor_businesses v ON v.id=s.vendor_id
        WHERE ($1::boolean = false OR s.state <> 'resolved') ORDER BY s.due_at`, [Boolean(input.activeOnly)]);
      return result.rows.map((row) => ({ id: String(row.public_id), orderId: String(row.order_public_id), fulfilmentId: String(row.fulfilment_public_id), vendorId: String(row.vendor_public_id),
        stage: String(row.stage) as FulfilmentSlaCase["stage"], state: String(row.state) as FulfilmentSlaCase["state"], openedAt: optionalEpoch(row.opened_at)!, dueAt: optionalEpoch(row.due_at)!,
        escalationAt: optionalEpoch(row.escalation_at)!, breachedAt: optionalEpoch(row.breached_at), escalatedAt: optionalEpoch(row.escalated_at), resolvedAt: optionalEpoch(row.resolved_at),
        resolution: typeof row.resolution === "string" ? row.resolution : undefined }));
    }, { readOnly: true });
  }
}
