import { randomUUID } from "node:crypto";
import { can, PostgresUnitOfWork, type Permission, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { vendorScope } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorReviewReportReason = "not_genuine" | "abusive" | "personal_data" | "conflict_of_interest" | "other";

export type VendorReviewView = Readonly<{
  id: string;
  productId: string;
  productTitle: string;
  interactionType: "verified_order" | "verified_advice";
  rating: number;
  body?: string;
  status: "pending" | "published" | "hidden" | "rejected";
  createdAt: number;
  response?: string;
  responseUpdatedAt?: number;
  reportStatus?: "open" | "under_review" | "resolved" | "rejected";
}>;

function requireVendorPermission(principal: SessionPrincipal, permission: Permission): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  if (!principal.roles.some((role) => can(role, permission))) throw new Error("VENDOR_REVIEWS_FORBIDDEN");
  return principal.vendorId;
}

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const valueText = typeof value === "string" ? value.trim() : ""; return valueText || undefined; }
function epoch(value: unknown): number { const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : 0; }
function publicId(prefix: string): string { return `${prefix}_${randomUUID().replaceAll("-", "")}`; }

export async function vendorReviewsWorkspace(principal: SessionPrincipal): Promise<readonly VendorReviewView[]> {
  const vendorId = requireVendorPermission(principal, "reviews.read");
  if (!productionDatabaseConfigured()) return [];
  return uow().withTransaction(vendorScope(principal.userId, vendorId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT r.public_id,r.interaction_type,r.rating,r.body,r.status,r.created_at,
             cv.public_id AS product_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS product_title,
             vrr.body AS response_body,vrr.updated_at AS response_updated_at,
             rr.status AS report_status
      FROM reviews r
      JOIN vendor_businesses vb ON vb.id=r.vendor_id
      JOIN canonical_variants cv ON cv.id=r.canonical_variant_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN vendor_review_responses vrr ON vrr.review_id=r.id AND vrr.vendor_id=r.vendor_id
      LEFT JOIN LATERAL (
        SELECT status FROM review_reports report
        WHERE report.review_id=r.id AND report.vendor_id=r.vendor_id
        ORDER BY CASE WHEN status IN ('open','under_review') THEN 0 ELSE 1 END,updated_at DESC LIMIT 1
      ) rr ON true
      WHERE vb.public_id=$1
      ORDER BY CASE r.status WHEN 'published' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,r.created_at DESC
      LIMIT 200
    `, [vendorId]);
    return result.rows.map(mapReview);
  }, { readOnly: true });
}

export async function respondToVendorReview(principal: SessionPrincipal, input: { reviewId: string; body: string; now?: number }): Promise<{ ok: true }> {
  const vendorId = requireVendorPermission(principal, "reviews.respond");
  if (!productionDatabaseConfigured()) throw new Error("Οι αξιολογήσεις απαιτούν την παραγωγική υπηρεσία PostgreSQL.");
  const reviewId = input.reviewId.trim();
  const body = input.body.trim();
  if (!reviewId || reviewId.length > 200) throw new Error("Η αξιολόγηση δεν είναι έγκυρη.");
  if (body.length < 1 || body.length > 2000) throw new Error("Η απάντηση πρέπει να έχει από 1 έως 2.000 χαρακτήρες.");
  const now = new Date(input.now ?? Date.now());
  return uow().withTransaction(vendorScope(principal.userId, vendorId), async (tx) => {
    const review = await ownedReview(tx, vendorId, reviewId, true);
    const actor = await actorUuid(tx, principal.userId);
    const existing = await tx.query<SqlRow>("SELECT id::text AS id FROM vendor_review_responses WHERE review_id=$1::uuid AND vendor_id=$2::uuid LIMIT 1", [review.reviewUuid, review.vendorUuid]);
    if (existing.rowCount) {
      await tx.query("UPDATE vendor_review_responses SET body=$2,actor_user_id=$3::uuid,actor_public_id=$4,updated_at=$5 WHERE id=$1::uuid", [text(existing.rows[0].id), body, actor, principal.userId, now]);
    } else {
      await tx.query(`
        INSERT INTO vendor_review_responses(public_id,review_id,vendor_id,actor_user_id,actor_public_id,body,created_at,updated_at)
        VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$7)
      `, [publicId("review_response"), review.reviewUuid, review.vendorUuid, actor, principal.userId, body, now]);
    }
    await tx.query(`INSERT INTO review_events(public_id,review_id,actor_user_id,actor_public_id,action,reason,created_at)
      VALUES($1,$2::uuid,$3::uuid,$4,$5,'Vendor response recorded',$6)`, [publicId("review_event"), review.reviewUuid, actor, principal.userId, existing.rowCount ? "review.vendor_response_updated" : "review.vendor_response_created", now]);
    return { ok: true } as const;
  }, { isolation: "serializable" });
}

export async function reportVendorReview(principal: SessionPrincipal, input: { reviewId: string; reason: VendorReviewReportReason; details: string; now?: number }): Promise<{ ok: true }> {
  const vendorId = requireVendorPermission(principal, "reviews.report");
  if (!productionDatabaseConfigured()) throw new Error("Οι αξιολογήσεις απαιτούν την παραγωγική υπηρεσία PostgreSQL.");
  const reviewId = input.reviewId.trim();
  const reason = input.reason;
  const details = input.details.trim();
  if (!reviewId || reviewId.length > 200) throw new Error("Η αξιολόγηση δεν είναι έγκυρη.");
  if (!["not_genuine","abusive","personal_data","conflict_of_interest","other"].includes(reason)) throw new Error("Ο λόγος αναφοράς δεν είναι έγκυρος.");
  if (details.length < 10 || details.length > 2000) throw new Error("Οι λεπτομέρειες αναφοράς πρέπει να έχουν από 10 έως 2.000 χαρακτήρες.");
  const now = new Date(input.now ?? Date.now());
  return uow().withTransaction(vendorScope(principal.userId, vendorId), async (tx) => {
    const review = await ownedReview(tx, vendorId, reviewId, true);
    const actor = await actorUuid(tx, principal.userId);
    const open = await tx.query<SqlRow>("SELECT 1 FROM review_reports WHERE review_id=$1::uuid AND vendor_id=$2::uuid AND status IN ('open','under_review') LIMIT 1", [review.reviewUuid, review.vendorUuid]);
    if (open.rowCount) throw new Error("Υπάρχει ήδη ενεργή αναφορά για αυτή την αξιολόγηση.");
    await tx.query(`
      INSERT INTO review_reports(public_id,review_id,vendor_id,reported_by,reported_by_public_id,reason,details,status,created_at,updated_at)
      VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,'open',$8,$8)
    `, [publicId("review_report"), review.reviewUuid, review.vendorUuid, actor, principal.userId, reason, details, now]);
    await tx.query(`INSERT INTO review_events(public_id,review_id,actor_user_id,actor_public_id,action,reason,created_at)
      VALUES($1,$2::uuid,$3::uuid,$4,'review.vendor_reported',$5,$6)`, [publicId("review_event"), review.reviewUuid, actor, principal.userId, reason, now]);
    return { ok: true } as const;
  }, { isolation: "serializable" });
}

async function ownedReview(tx: SqlExecutor, vendorPublicId: string, reviewPublicId: string, requirePublished: boolean): Promise<{ reviewUuid: string; vendorUuid: string }> {
  const result = await tx.query<SqlRow>(`
    SELECT r.id::text AS review_uuid,r.vendor_id::text AS vendor_uuid,r.status
    FROM reviews r JOIN vendor_businesses vb ON vb.id=r.vendor_id
    WHERE r.public_id=$1 AND vb.public_id=$2 ${requirePublished ? "AND r.status='published'" : ""}
    FOR UPDATE OF r
  `, [reviewPublicId, vendorPublicId]);
  if (!result.rowCount) throw new Error(requirePublished ? "Μόνο δημοσιευμένη αξιολόγηση μπορεί να απαντηθεί ή να αναφερθεί." : "Vendor review access denied");
  return { reviewUuid:text(result.rows[0].review_uuid), vendorUuid:text(result.rows[0].vendor_uuid) };
}

async function actorUuid(tx: SqlExecutor, publicId: string): Promise<string> {
  const result = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 AND status='active' LIMIT 1", [publicId]);
  if (!result.rowCount) throw new Error("Vendor actor not found");
  return text(result.rows[0].id);
}

function mapReview(row: SqlRow): VendorReviewView {
  return {
    id:text(row.public_id), productId:text(row.product_id), productTitle:text(row.product_title),
    interactionType:text(row.interaction_type) as VendorReviewView["interactionType"], rating:integer(row.rating), body:optionalText(row.body),
    status:text(row.status) as VendorReviewView["status"], createdAt:epoch(row.created_at), response:optionalText(row.response_body),
    responseUpdatedAt:row.response_updated_at ? epoch(row.response_updated_at) : undefined,
    reportStatus:optionalText(row.report_status) as VendorReviewView["reportStatus"] | undefined
  };
}
