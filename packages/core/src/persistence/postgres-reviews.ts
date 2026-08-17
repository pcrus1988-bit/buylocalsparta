import { randomUUID } from "node:crypto";
import type { PublicReview, Review, ReviewEvent, ReviewReport, VendorReviewResponse } from "../reviews/index.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

async function resolveId(db: SqlExecutor, table: string, publicId: string, alternateColumn = "public_id"): Promise<string> {
  const allowed = new Set(["markets", "users", "vendor_businesses", "canonical_variants", "customer_orders", "order_lines", "conversations", "appointments", "reviews", "review_reports"]);
  if (!allowed.has(table)) throw new Error(`Unsupported review persistence table ${table}`);
  const where = table === "markets" ? "code=$1 OR id::text=$1" : `${alternateColumn}=$1 OR id::text=$1`;
  const result = await db.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE ${where}`, [publicId]);
  return String(requireSingleRow(result, `${table} record ${publicId} was not found`).id);
}

function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid review timestamp from database");
  return parsed;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function mapPublicReview(row: SqlRow): PublicReview {
  const interactionType = String(row.interaction_type) as Review["interactionType"];
  const response = typeof row.response_public_id === "string" ? {
    id: String(row.response_public_id), reviewId: String(row.public_id), vendorId: String(row.vendor_public_id),
    actorId: String(row.response_actor_public_id), body: String(row.response_body), createdAt: epoch(row.response_created_at), updatedAt: epoch(row.response_updated_at)
  } satisfies VendorReviewResponse : undefined;
  return {
    id: String(row.public_id), marketId: String(row.market_code), vendorId: String(row.vendor_public_id), canonicalVariantId: String(row.canonical_public_id),
    interactionType, orderId: optionalString(row.order_public_id), orderLineId: optionalString(row.order_line_public_id),
    conversationId: optionalString(row.conversation_public_id), appointmentId: optionalString(row.appointment_public_id),
    rating: Number(row.rating), body: optionalString(row.body), incentiveType: String(row.incentive_type) as Review["incentiveType"],
    incentiveDetails: optionalString(row.incentive_details), status: String(row.status) as Review["status"], createdAt: epoch(row.created_at), updatedAt: epoch(row.updated_at),
    publishedAt: row.published_at ? epoch(row.published_at) : undefined,
    authorLabel: interactionType === "verified_order" ? "Verified buyer" : "Verified advice customer", response
  };
}

export class PostgresReviewRepository {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
  }

  async saveReview(input: { scope: DatabaseScope; review: Review }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, actorUserId: input.review.customerId, marketId: input.review.marketId, platformAccess: false }, async (tx) => {
      const marketId = await resolveId(tx, "markets", input.review.marketId);
      const userId = await resolveId(tx, "users", input.review.customerId);
      const vendorId = await resolveId(tx, "vendor_businesses", input.review.vendorId);
      const canonicalId = await resolveId(tx, "canonical_variants", input.review.canonicalVariantId);
      const orderId = input.review.orderId ? await resolveId(tx, "customer_orders", input.review.orderId) : null;
      const orderLineId = input.review.orderLineId ? await resolveId(tx, "order_lines", input.review.orderLineId) : null;
      const conversationId = input.review.conversationId ? await resolveId(tx, "conversations", input.review.conversationId) : null;
      const appointmentId = input.review.appointmentId ? await resolveId(tx, "appointments", input.review.appointmentId) : null;
      await tx.query(`
        INSERT INTO reviews
          (id,public_id,market_id,user_id,vendor_id,canonical_variant_id,order_id,order_line_id,conversation_id,appointment_id,
           interaction_type,rating,body,incentive_type,incentive_details,status,published_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (public_id) DO NOTHING
      `, [randomUUID(), input.review.id, marketId, userId, vendorId, canonicalId, orderId, orderLineId, conversationId, appointmentId,
        input.review.interactionType, input.review.rating, input.review.body ?? null, input.review.incentiveType, input.review.incentiveDetails ?? null,
        input.review.status, input.review.publishedAt ? new Date(input.review.publishedAt) : null, new Date(input.review.createdAt), new Date(input.review.updatedAt)]);
    });
  }

  async saveResponse(input: { scope: DatabaseScope; response: VendorReviewResponse }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, actorUserId: input.response.actorId, vendorId: input.response.vendorId, platformAccess: false }, async (tx) => {
      const reviewId = await resolveId(tx, "reviews", input.response.reviewId);
      const vendorId = await resolveId(tx, "vendor_businesses", input.response.vendorId);
      const actorId = await resolveId(tx, "users", input.response.actorId);
      await tx.query(`
        INSERT INTO vendor_review_responses (id,public_id,review_id,vendor_id,actor_user_id,actor_public_id,body,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (review_id) DO UPDATE SET actor_user_id=EXCLUDED.actor_user_id,actor_public_id=EXCLUDED.actor_public_id,
          body=EXCLUDED.body,updated_at=EXCLUDED.updated_at
      `, [randomUUID(), input.response.id, reviewId, vendorId, actorId, input.response.actorId, input.response.body, new Date(input.response.createdAt), new Date(input.response.updatedAt)]);
    });
  }

  async saveReport(input: { scope: DatabaseScope; report: ReviewReport }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, actorUserId: input.report.reportedBy, vendorId: input.report.vendorId, platformAccess: false }, async (tx) => {
      const reviewId = await resolveId(tx, "reviews", input.report.reviewId);
      const vendorId = await resolveId(tx, "vendor_businesses", input.report.vendorId);
      const reporterId = await resolveId(tx, "users", input.report.reportedBy);
      await tx.query(`
        INSERT INTO review_reports (id,public_id,review_id,vendor_id,reported_by,reported_by_public_id,reason,details,status,resolution,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status,resolution=EXCLUDED.resolution,updated_at=EXCLUDED.updated_at
      `, [randomUUID(), input.report.id, reviewId, vendorId, reporterId, input.report.reportedBy, input.report.reason, input.report.details,
        input.report.status, input.report.resolution ?? null, new Date(input.report.createdAt), new Date(input.report.updatedAt)]);
    });
  }

  async moderate(input: { scope: DatabaseScope; review: Review; event: ReviewEvent }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, actorUserId: input.event.actorId, marketId: input.review.marketId, platformAccess: true }, async (tx) => {
      const reviewId = await resolveId(tx, "reviews", input.review.id);
      const actorResult = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [input.event.actorId]);
      const actorId = actorResult.rowCount === 1 ? String(actorResult.rows[0].id) : null;
      await tx.query("UPDATE reviews SET status=$1,published_at=$2,updated_at=$3 WHERE id=$4", [input.review.status, input.review.publishedAt ? new Date(input.review.publishedAt) : null, new Date(input.review.updatedAt), reviewId]);
      await tx.query(`INSERT INTO review_events (id,public_id,review_id,actor_user_id,actor_public_id,action,reason,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (public_id) DO NOTHING`,
        [randomUUID(), input.event.id, reviewId, actorId, input.event.actorId, input.event.action, input.event.reason ?? null, new Date(input.event.createdAt)]);
    });
  }

  async publicByProduct(canonicalVariantId: string): Promise<readonly PublicReview[]> {
    return this.#uow.withTransaction({ platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT r.public_id,m.code AS market_code,v.public_id AS vendor_public_id,cv.public_id AS canonical_public_id,
          o.public_id AS order_public_id,ol.public_id AS order_line_public_id,c.public_id AS conversation_public_id,a.public_id AS appointment_public_id,
          r.interaction_type,r.rating,r.body,r.incentive_type,r.incentive_details,r.status,r.published_at,r.created_at,r.updated_at,
          vr.public_id AS response_public_id,vr.actor_public_id AS response_actor_public_id,vr.body AS response_body,
          vr.created_at AS response_created_at,vr.updated_at AS response_updated_at
        FROM reviews r
        JOIN markets m ON m.id=r.market_id JOIN vendor_businesses v ON v.id=r.vendor_id JOIN canonical_variants cv ON cv.id=r.canonical_variant_id
        LEFT JOIN customer_orders o ON o.id=r.order_id LEFT JOIN order_lines ol ON ol.id=r.order_line_id
        LEFT JOIN conversations c ON c.id=r.conversation_id LEFT JOIN appointments a ON a.id=r.appointment_id
        LEFT JOIN vendor_review_responses vr ON vr.review_id=r.id
        WHERE (cv.public_id=$1 OR cv.id::text=$1) AND r.status='published'
        ORDER BY r.created_at DESC
      `, [canonicalVariantId]);
      return result.rows.map(mapPublicReview);
    }, { readOnly: true });
  }
}
