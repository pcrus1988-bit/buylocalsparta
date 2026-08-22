import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerReviewSourceKind = "order_line" | "appointment" | "conversation";

export type CustomerReviewCandidate = Readonly<{
  sourceKind: CustomerReviewSourceKind;
  sourceId: string;
  sourceAt: number;
  vendorId: string;
  vendorName: string;
  productId: string;
  productTitle: string;
}>;

export type CustomerReviewView = Readonly<{
  id: string;
  sourceKind: CustomerReviewSourceKind;
  sourceId: string;
  vendorId: string;
  vendorName: string;
  productId: string;
  productTitle: string;
  rating: number;
  body?: string;
  status: "pending" | "published" | "hidden" | "rejected";
  createdAt: number;
  vendorResponse?: string;
}>;

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const valueText = typeof value === "string" ? value.trim() : ""; return valueText || undefined; }
function epoch(value: unknown): number { const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : 0; }
function reviewPublicId(): string { return `review_${randomUUID().replaceAll("-", "")}`; }
function reviewEventPublicId(): string { return `review_event_${randomUUID().replaceAll("-", "")}`; }

export function customerReviewsReadiness(): { ready: boolean; message: string } {
  return productionDatabaseConfigured()
    ? { ready: true, message: "Verified reviews enabled" }
    : { ready: false, message: "Οι αξιολογήσεις απαιτούν την ασφαλή υπηρεσία PostgreSQL." };
}

export async function customerReviewWorkspace(principal: SessionPrincipal): Promise<{ candidates: readonly CustomerReviewCandidate[]; reviews: readonly CustomerReviewView[] }> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) return { candidates: [], reviews: [] };
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customerUuid = await resolveCustomerUuid(tx, principal.userId);
    const [orderRows, appointmentRows, conversationRows, reviewRows] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT DISTINCT ON (ol.id)
               'order_line' AS source_kind,ol.public_id AS source_id,COALESCE(fo.delivered_at,fo.updated_at) AS source_at,
               vb.public_id AS vendor_id,vb.trading_name AS vendor_name,
               cv.public_id AS product_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS product_title
        FROM customer_orders o
        JOIN order_lines ol ON ol.order_id=o.id
        JOIN vendor_businesses vb ON vb.id=ol.vendor_id
        JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
        JOIN fulfilment_order_lines fol ON fol.order_line_id=ol.id
        JOIN fulfilment_orders fo ON fo.id=fol.fulfilment_order_id AND fo.order_id=o.id AND fo.vendor_id=ol.vendor_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE o.user_id=$1::uuid AND fo.status='delivered'
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.user_id=o.user_id AND r.order_line_id=ol.id)
        ORDER BY ol.id,COALESCE(fo.delivered_at,fo.updated_at) DESC
      `, [customerUuid]),
      tx.query<SqlRow>(`
        SELECT 'appointment' AS source_kind,a.public_id AS source_id,a.starts_at AS source_at,
               vb.public_id AS vendor_id,vb.trading_name AS vendor_name,
               cv.public_id AS product_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS product_title
        FROM appointments a
        JOIN vendor_businesses vb ON vb.id=a.vendor_id
        JOIN canonical_variants cv ON cv.id=a.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE a.customer_user_id=$1::uuid AND a.status='completed'
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.user_id=a.customer_user_id AND r.appointment_id=a.id)
        ORDER BY a.starts_at DESC
      `, [customerUuid]),
      tx.query<SqlRow>(`
        SELECT 'conversation' AS source_kind,c.public_id AS source_id,c.updated_at AS source_at,
               vb.public_id AS vendor_id,vb.trading_name AS vendor_name,
               cv.public_id AS product_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS product_title
        FROM conversations c
        JOIN vendor_businesses vb ON vb.id=c.vendor_id
        JOIN canonical_variants cv ON cv.id=c.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE c.customer_user_id=$1::uuid
          AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.sender_type='customer')
          AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.sender_type='vendor')
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.user_id=c.customer_user_id AND r.conversation_id=c.id)
        ORDER BY c.updated_at DESC
      `, [customerUuid]),
      tx.query<SqlRow>(`
        SELECT r.public_id,r.interaction_type,r.rating,r.body,r.status,r.created_at,
               COALESCE(ol.public_id,a.public_id,c.public_id) AS source_id,
               CASE WHEN r.order_line_id IS NOT NULL THEN 'order_line' WHEN r.appointment_id IS NOT NULL THEN 'appointment' ELSE 'conversation' END AS source_kind,
               vb.public_id AS vendor_id,vb.trading_name AS vendor_name,
               cv.public_id AS product_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS product_title,
               vrr.body AS vendor_response
        FROM reviews r
        JOIN vendor_businesses vb ON vb.id=r.vendor_id
        JOIN canonical_variants cv ON cv.id=r.canonical_variant_id
        LEFT JOIN order_lines ol ON ol.id=r.order_line_id
        LEFT JOIN appointments a ON a.id=r.appointment_id
        LEFT JOIN conversations c ON c.id=r.conversation_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        LEFT JOIN vendor_review_responses vrr ON vrr.review_id=r.id
        WHERE r.user_id=$1::uuid
        ORDER BY r.created_at DESC
        LIMIT 100
      `, [customerUuid])
    ]);
    return {
      candidates: [...orderRows.rows, ...appointmentRows.rows, ...conversationRows.rows].map(mapCandidate).sort((a,b) => b.sourceAt-a.sourceAt),
      reviews: reviewRows.rows.map(mapReview)
    };
  }, { readOnly: true });
}

export async function createCustomerReview(principal: SessionPrincipal, input: {
  sourceKind: CustomerReviewSourceKind;
  sourceId: string;
  rating: number;
  body?: string;
  now?: number;
}): Promise<CustomerReviewView> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Οι αξιολογήσεις απαιτούν την παραγωγική υπηρεσία PostgreSQL.");
  const sourceKind = input.sourceKind;
  if (!["order_line","appointment","conversation"].includes(sourceKind)) throw new Error("Η επαληθευμένη πηγή αξιολόγησης δεν είναι έγκυρη.");
  const sourceId = input.sourceId.trim();
  if (!sourceId || sourceId.length > 200) throw new Error("Η επαληθευμένη πηγή αξιολόγησης δεν είναι έγκυρη.");
  const rating = Number(input.rating);
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5) throw new Error("Η βαθμολογία πρέπει να είναι από 1 έως 5.");
  const body = normalizeBody(input.body);
  const now = new Date(input.now ?? Date.now());
  const id = reviewPublicId();

  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customerUuid = await resolveCustomerUuid(tx, principal.userId);
    const source = await resolveVerifiedSource(tx, customerUuid, sourceKind, sourceId);
    const existing = await tx.query<SqlRow>(`SELECT 1 FROM reviews WHERE user_id=$1::uuid AND ${source.existingColumn}=$2::uuid LIMIT 1`, [customerUuid, source.sourceUuid]);
    if (existing.rowCount) throw new Error("Έχεις ήδη αξιολογήσει αυτή την επαληθευμένη εμπειρία.");
    const inserted = await tx.query<SqlRow>(`
      INSERT INTO reviews(
        public_id,market_id,user_id,vendor_id,canonical_variant_id,order_id,order_line_id,conversation_id,appointment_id,
        interaction_type,rating,body,status,incentive_type,incentive_details,created_at,updated_at
      ) VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10,$11,$12,'pending','none',NULL,$13,$13)
      RETURNING id::text AS review_uuid
    `, [id, source.marketUuid, customerUuid, source.vendorUuid, source.productUuid, source.orderUuid, source.orderLineUuid, source.conversationUuid, source.appointmentUuid, source.interactionType, rating, body ?? null, now]);
    await tx.query(`
      INSERT INTO review_events(public_id,review_id,actor_user_id,actor_public_id,action,reason,created_at)
      VALUES($1,$2::uuid,$3::uuid,$4,'review.customer_created','Verified customer interaction',$5)
    `, [reviewEventPublicId(), text(inserted.rows[0].review_uuid), customerUuid, principal.userId, now]);
  }, { isolation: "serializable" });

  const workspace = await customerReviewWorkspace(principal);
  const created = workspace.reviews.find((review) => review.id === id);
  if (!created) throw new Error("Η αξιολόγηση δημιουργήθηκε αλλά δεν ήταν δυνατό να ανακτηθεί.");
  return created;
}

async function resolveCustomerUuid(tx: SqlExecutor, publicId: string): Promise<string> {
  const result = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 AND status='active' LIMIT 1", [publicId]);
  if (!result.rowCount) throw new Error("Ο λογαριασμός πελάτη δεν βρέθηκε.");
  return text(result.rows[0].id);
}

type ResolvedSource = Readonly<{
  sourceUuid: string;
  existingColumn: "order_line_id" | "appointment_id" | "conversation_id";
  marketUuid: string;
  vendorUuid: string;
  productUuid: string;
  orderUuid: string | null;
  orderLineUuid: string | null;
  appointmentUuid: string | null;
  conversationUuid: string | null;
  interactionType: "verified_order" | "verified_advice";
}>;

async function resolveVerifiedSource(tx: SqlExecutor, customerUuid: string, kind: CustomerReviewSourceKind, publicId: string): Promise<ResolvedSource> {
  if (kind === "order_line") {
    const result = await tx.query<SqlRow>(`
      SELECT ol.id::text AS source_uuid,o.id::text AS order_uuid,o.market_id::text AS market_uuid,
             ol.vendor_id::text AS vendor_uuid,ol.canonical_variant_id::text AS product_uuid
      FROM customer_orders o
      JOIN order_lines ol ON ol.order_id=o.id
      WHERE o.user_id=$1::uuid AND ol.public_id=$2
        AND EXISTS (
          SELECT 1 FROM fulfilment_order_lines fol JOIN fulfilment_orders fo ON fo.id=fol.fulfilment_order_id
          WHERE fol.order_line_id=ol.id AND fo.order_id=o.id AND fo.vendor_id=ol.vendor_id AND fo.status='delivered'
        )
      LIMIT 1
    `, [customerUuid, publicId]);
    if (!result.rowCount) throw new Error("Η γραμμή παραγγελίας δεν είναι επιλέξιμη για επαληθευμένη αξιολόγηση.");
    const row = result.rows[0];
    return { sourceUuid:text(row.source_uuid), existingColumn:"order_line_id", marketUuid:text(row.market_uuid), vendorUuid:text(row.vendor_uuid), productUuid:text(row.product_uuid), orderUuid:text(row.order_uuid), orderLineUuid:text(row.source_uuid), appointmentUuid:null, conversationUuid:null, interactionType:"verified_order" };
  }
  if (kind === "appointment") {
    const result = await tx.query<SqlRow>(`
      SELECT a.id::text AS source_uuid,a.market_id::text AS market_uuid,a.vendor_id::text AS vendor_uuid,a.canonical_variant_id::text AS product_uuid
      FROM appointments a
      WHERE a.customer_user_id=$1::uuid AND a.public_id=$2 AND a.status='completed' AND a.canonical_variant_id IS NOT NULL
      LIMIT 1
    `, [customerUuid, publicId]);
    if (!result.rowCount) throw new Error("Το ραντεβού δεν είναι επιλέξιμο για επαληθευμένη αξιολόγηση.");
    const row = result.rows[0];
    return { sourceUuid:text(row.source_uuid), existingColumn:"appointment_id", marketUuid:text(row.market_uuid), vendorUuid:text(row.vendor_uuid), productUuid:text(row.product_uuid), orderUuid:null, orderLineUuid:null, appointmentUuid:text(row.source_uuid), conversationUuid:null, interactionType:"verified_advice" };
  }
  const result = await tx.query<SqlRow>(`
    SELECT c.id::text AS source_uuid,c.market_id::text AS market_uuid,c.vendor_id::text AS vendor_uuid,c.canonical_variant_id::text AS product_uuid
    FROM conversations c
    WHERE c.customer_user_id=$1::uuid AND c.public_id=$2 AND c.vendor_id IS NOT NULL AND c.canonical_variant_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.sender_type='customer')
      AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.sender_type='vendor')
    LIMIT 1
  `, [customerUuid, publicId]);
  if (!result.rowCount) throw new Error("Η συνομιλία δεν είναι επιλέξιμη για επαληθευμένη αξιολόγηση.");
  const row = result.rows[0];
  return { sourceUuid:text(row.source_uuid), existingColumn:"conversation_id", marketUuid:text(row.market_uuid), vendorUuid:text(row.vendor_uuid), productUuid:text(row.product_uuid), orderUuid:null, orderLineUuid:null, appointmentUuid:null, conversationUuid:text(row.source_uuid), interactionType:"verified_advice" };
}

function normalizeBody(value: string | undefined): string | undefined {
  const body = value?.trim();
  if (!body) return undefined;
  if (body.length > 2000) throw new Error("Το κείμενο της αξιολόγησης μπορεί να έχει έως 2.000 χαρακτήρες.");
  return body;
}

function mapCandidate(row: SqlRow): CustomerReviewCandidate {
  return { sourceKind:text(row.source_kind) as CustomerReviewSourceKind, sourceId:text(row.source_id), sourceAt:epoch(row.source_at), vendorId:text(row.vendor_id), vendorName:text(row.vendor_name), productId:text(row.product_id), productTitle:text(row.product_title) };
}

function mapReview(row: SqlRow): CustomerReviewView {
  return { id:text(row.public_id), sourceKind:text(row.source_kind) as CustomerReviewSourceKind, sourceId:text(row.source_id), vendorId:text(row.vendor_id), vendorName:text(row.vendor_name), productId:text(row.product_id), productTitle:text(row.product_title), rating:integer(row.rating), body:optionalText(row.body), status:text(row.status) as CustomerReviewView["status"], createdAt:epoch(row.created_at), vendorResponse:optionalText(row.vendor_response) };
}
