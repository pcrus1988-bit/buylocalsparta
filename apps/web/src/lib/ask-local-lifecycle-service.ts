import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { vendorCreateAskLocalOffer } from "./ask-local-offer-service";
import type { AskLocalRequestView } from "./ask-local-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const memoryKey = "__blsAskLocalMemory" as const;
const globals = globalThis as typeof globalThis & { [memoryKey]?: Map<string, AskLocalRequestView[]> };
const OPEN_CUSTOMER_STATUSES = new Set(["submitted", "matched", "assigned", "awaiting_vendor", "needs_info", "offered"]);

export type VendorAskLocalProductOption = Readonly<{
  canonicalVariantId: string;
  vendorOfferId: string;
  title: string;
  availableToSell: number;
}>;

export type VendorAskLocalOfferState = Readonly<{
  requestId: string;
  status: string;
  expiresAt: number;
  productTitle?: string;
}>;

function memoryStore(): Map<string, AskLocalRequestView[]> {
  return globals[memoryKey] ??= new Map();
}

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

function requireVendor(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function validateOffer(input: { priceMinor: number; fulfilmentPromise: string; expiresAt: number }, now: number) {
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 30 || input.priceMinor > 100_000_000) throw new Error("Η προσφορά πρέπει να είναι από 0,30 € έως 1.000.000 €.");
  const fulfilmentPromise = input.fulfilmentPromise.trim().replace(/\s+/g, " ");
  if (fulfilmentPromise.length < 3 || fulfilmentPromise.length > 500) throw new Error("Πρόσθεσε σύντομη και σαφή περιγραφή εκπλήρωσης.");
  if (!Number.isFinite(input.expiresAt) || input.expiresAt <= now + 5 * 60 * 1000) throw new Error("Η προσφορά πρέπει να ισχύει για τουλάχιστον 5 λεπτά.");
  if (input.expiresAt > now + 30 * 24 * 60 * 60 * 1000) throw new Error("Η προσφορά δεν μπορεί να ισχύει περισσότερο από 30 ημέρες.");
  return { priceMinor: input.priceMinor, fulfilmentPromise, expiresAt: input.expiresAt };
}

function expireMemoryRequests(predicate: (request: AskLocalRequestView) => boolean, now: number): void {
  for (const [customerId, requests] of memoryStore()) {
    let changed = false;
    const next = requests.map((request) => {
      if (!predicate(request) || request.status !== "offered") return request;
      const hasExpiredActiveOffer = request.privateOffers.some((offer) => offer.status === "active" && offer.expiresAt <= now);
      if (!hasExpiredActiveOffer) return request;
      changed = true;
      return {
        ...request,
        status: "expired",
        privateOffers: request.privateOffers.map((offer) => offer.status === "active" && offer.expiresAt <= now ? { ...offer, status: "expired" } : offer)
      };
    });
    if (changed) memoryStore().set(customerId, next);
  }
}

export async function expireCustomerAskLocalOffers(principal: SessionPrincipal, now = Date.now()): Promise<void> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) {
    expireMemoryRequests((request) => (memoryStore().get(principal.userId) ?? []).includes(request), now);
    return;
  }
  const runtime = getProductionPostgresRuntime();
  await runtime.sqlPool.query(`
    WITH expired_offers AS (
      UPDATE private_offers po
      SET status='expired'
      FROM counteroffer_requests cr
      JOIN users u ON u.id=cr.customer_user_id
      WHERE po.counteroffer_request_id=cr.id
        AND u.public_id=$1
        AND cr.status='offered'
        AND po.status='active'
        AND po.expires_at <= $2
      RETURNING po.counteroffer_request_id
    )
    UPDATE counteroffer_requests cr
    SET status='expired', updated_at=$2, workflow_updated_at=$2
    WHERE cr.status='offered'
      AND cr.id IN (SELECT counteroffer_request_id FROM expired_offers)
  `, [principal.userId, new Date(now)]);
}

export async function expireVendorAskLocalOffers(principal: SessionPrincipal, now = Date.now()): Promise<void> {
  const vendorId = requireVendor(principal);
  if (!productionDatabaseConfigured()) {
    expireMemoryRequests((request) => request.assignedVendorId === vendorId, now);
    return;
  }
  const runtime = getProductionPostgresRuntime();
  await runtime.sqlPool.query(`
    WITH expired_offers AS (
      UPDATE private_offers po
      SET status='expired'
      FROM counteroffer_requests cr
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      WHERE po.counteroffer_request_id=cr.id
        AND v.public_id=$1
        AND cr.status='offered'
        AND po.status='active'
        AND po.expires_at <= $2
      RETURNING po.counteroffer_request_id
    )
    UPDATE counteroffer_requests cr
    SET status='expired', updated_at=$2, workflow_updated_at=$2
    WHERE cr.status='offered'
      AND cr.id IN (SELECT counteroffer_request_id FROM expired_offers)
  `, [vendorId, new Date(now)]);
}

export async function customerCancelAskLocalRequest(principal: SessionPrincipal, requestReference: string, now = Date.now()): Promise<void> {
  requireCustomer(principal);
  const reference = requestReference.trim();
  if (!reference) throw new Error("Το Ask Local αίτημα είναι υποχρεωτικό.");

  if (!productionDatabaseConfigured()) {
    const requests = memoryStore().get(principal.userId) ?? [];
    const index = requests.findIndex((request) => request.referenceNumber === reference || request.id === reference);
    if (index < 0) throw new Error("Το αίτημα δεν βρέθηκε στον λογαριασμό σου.");
    const current = requests[index];
    if (!OPEN_CUSTOMER_STATUSES.has(current.status)) throw new Error("Το αίτημα δεν μπορεί πλέον να ακυρωθεί.");
    requests[index] = {
      ...current,
      status: "closed",
      assignmentReason: "customer_cancelled",
      privateOffers: current.privateOffers.map((offer) => offer.status === "active" ? { ...offer, status: "revoked" } : offer)
    };
    memoryStore().set(principal.userId, requests);
    return;
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT cr.id::text AS request_uuid,cr.public_id,cr.reference_number,cr.status::text,
             cr.assigned_vendor_id::text AS vendor_uuid,cr.assignment_reason
      FROM counteroffer_requests cr
      JOIN users u ON u.id=cr.customer_user_id
      WHERE u.public_id=$1 AND (cr.reference_number=$2 OR cr.public_id=$2)
      FOR UPDATE OF cr
    `, [principal.userId, reference]);
    if (!found.rowCount) throw new Error("Το αίτημα δεν βρέθηκε στον λογαριασμό σου.");
    const row = found.rows[0];
    if (!OPEN_CUSTOMER_STATUSES.has(String(row.status))) throw new Error("Το αίτημα δεν μπορεί πλέον να ακυρωθεί.");

    await tx.query("UPDATE private_offers SET status='revoked' WHERE counteroffer_request_id=$1::uuid AND status='active'", [String(row.request_uuid)]);
    await tx.query(`
      UPDATE counteroffer_requests
      SET status='closed',
          assignment_reason='customer_cancelled',
          source_metadata=COALESCE(source_metadata,'{}'::jsonb) || $2::jsonb,
          updated_at=$3,
          workflow_updated_at=$3
      WHERE id=$1::uuid
    `, [String(row.request_uuid), JSON.stringify({ customerCancelledAt: new Date(now).toISOString(), previousAssignmentReason: row.assignment_reason ?? null }), new Date(now)]);

    if (row.vendor_uuid) {
      await tx.query(`
        INSERT INTO notifications(id,public_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
        VALUES($1,$2,$3::uuid,'in_app','transactional','ask_local.request_cancelled','ask-local-cancel-v1','el','Το Ask Local αίτημα ακυρώθηκε από τον πελάτη',$4,$5::jsonb,'queued',$6,$7)
        ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      `, [randomUUID(), `notification_${randomUUID()}`, String(row.vendor_uuid), `Ask Local ${String(row.reference_number ?? row.public_id)}`, JSON.stringify({ requestId: String(row.public_id), requestReference: String(row.reference_number ?? "") }), `ask-local-cancel:${String(row.public_id)}:vendor`, new Date(now)]);
    }
  }, { isolation: "serializable" });
}

export async function vendorPurchasableAskLocalProducts(principal: SessionPrincipal): Promise<readonly VendorAskLocalProductOption[]> {
  const vendorId = requireVendor(principal);
  if (!productionDatabaseConfigured()) return [];
  const runtime = getProductionPostgresRuntime();
  const rows = await runtime.sqlPool.query(`
    SELECT DISTINCT ON (cv.id)
           cv.public_id AS canonical_variant_id,
           vo.public_id AS vendor_offer_id,
           COALESCE(el.title,en.title,cv.model,cv.slug,'Προϊόν') AS title,
           GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)::int AS available_to_sell
    FROM vendor_businesses v
    JOIN vendor_offers vo ON vo.vendor_id=v.id
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN categories c ON c.id=cv.category_id
    JOIN vendor_locations vl ON vl.id=vo.location_id
    JOIN inventory_balances ib ON ib.offer_id=vo.id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE v.public_id=$1
      AND v.status='active'
      AND vo.status='approved'
      AND vl.active=true
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND c.counteroffer_allowed=true
      AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
      AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > now()
      AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) > 0
    ORDER BY cv.id, available_to_sell DESC, vo.updated_at DESC
    LIMIT 400
  `, [vendorId]);
  return rows.rows.map((row) => ({
    canonicalVariantId: String(row.canonical_variant_id),
    vendorOfferId: String(row.vendor_offer_id),
    title: String(row.title),
    availableToSell: Number(row.available_to_sell ?? 0)
  }));
}

export async function vendorAskLocalOfferStates(principal: SessionPrincipal): Promise<readonly VendorAskLocalOfferState[]> {
  const vendorId = requireVendor(principal);
  if (!productionDatabaseConfigured()) return [];
  const runtime = getProductionPostgresRuntime();
  const rows = await runtime.sqlPool.query(`
    SELECT DISTINCT ON (cr.public_id)
           cr.public_id AS request_id,po.status::text,po.expires_at,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS product_title
    FROM counteroffer_requests cr
    JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
    JOIN private_offers po ON po.counteroffer_request_id=cr.id
    LEFT JOIN canonical_variants cv ON cv.id=po.canonical_variant_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE v.public_id=$1
    ORDER BY cr.public_id,po.created_at DESC
  `, [vendorId]);
  return rows.rows.map((row) => ({
    requestId: String(row.request_id),
    status: String(row.status),
    expiresAt: new Date(String(row.expires_at)).getTime(),
    productTitle: row.product_title ? String(row.product_title) : undefined
  }));
}

export async function vendorCreatePurchasableAskLocalOffer(
  principal: SessionPrincipal,
  input: { requestId: string; priceMinor: number; fulfilmentPromise: string; expiresAt: number; canonicalVariantId?: string; now?: number }
): Promise<void> {
  const vendorId = requireVendor(principal);
  const now = input.now ?? Date.now();
  const offer = validateOffer(input, now);
  const requestId = input.requestId.trim();
  const selectedCanonical = input.canonicalVariantId?.trim() || undefined;
  if (!requestId) throw new Error("Ask Local request is required.");

  if (!productionDatabaseConfigured()) {
    await vendorCreateAskLocalOffer(principal, { requestId, priceMinor: offer.priceMinor, fulfilmentPromise: offer.fulfilmentPromise, expiresAt: offer.expiresAt, now });
    return;
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, vendorId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT cr.id::text AS request_uuid,cr.public_id,cr.reference_number,cr.status::text,cr.expires_at,
             cr.customer_user_id::text AS customer_uuid,cr.canonical_variant_id::text AS canonical_uuid,
             cr.assigned_offer_id::text AS assigned_offer_uuid,cr.requested_quantity::int,v.id::text AS vendor_uuid
      FROM counteroffer_requests cr
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      WHERE cr.public_id=$1 AND v.public_id=$2
      FOR UPDATE OF cr
    `, [requestId, vendorId]);
    if (!found.rowCount) throw new Error("Το Ask Local αίτημα δεν είναι ανατεθειμένο σε αυτό το κατάστημα.");
    const row = found.rows[0];
    if (String(row.status) !== "awaiting_vendor") throw new Error("Το αίτημα δεν δέχεται νέα προσφορά στην τρέχουσα κατάσταση.");
    if (row.expires_at && new Date(String(row.expires_at)).getTime() <= now) throw new Error("Η προθεσμία απάντησης του αιτήματος έχει λήξει.");

    const existing = await tx.query<SqlRow>("SELECT 1 FROM private_offers WHERE counteroffer_request_id=$1::uuid AND status='active' LIMIT 1", [String(row.request_uuid)]);
    if (existing.rowCount) throw new Error("Υπάρχει ήδη ενεργή ιδιωτική προσφορά για αυτό το αίτημα.");

    let candidate: SqlRow | undefined;
    if (row.canonical_uuid) {
      const candidates = await tx.query<SqlRow>(`
        SELECT cv.id::text AS canonical_uuid,vo.id::text AS offer_uuid
        FROM canonical_variants cv
        JOIN categories c ON c.id=cv.category_id
        JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id AND vo.vendor_id=$2::uuid
        JOIN vendor_locations vl ON vl.id=vo.location_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id
        WHERE cv.id=$1::uuid
          AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
          AND c.counteroffer_allowed=true
          AND vo.status='approved' AND vl.active=true
          AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $3
          AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) >= $4
        ORDER BY CASE WHEN vo.id=$5::uuid THEN 0 ELSE 1 END,vo.updated_at DESC
        LIMIT 1
      `, [String(row.canonical_uuid), String(row.vendor_uuid), new Date(now), Number(row.requested_quantity ?? 1), row.assigned_offer_uuid ? String(row.assigned_offer_uuid) : null]);
      candidate = candidates.rows[0];
    } else {
      if (!selectedCanonical) throw new Error("Για γενικό Ask Local αίτημα επίλεξε πρώτα το συγκεκριμένο προϊόν που προσφέρεις.");
      const candidates = await tx.query<SqlRow>(`
        SELECT cv.id::text AS canonical_uuid,vo.id::text AS offer_uuid
        FROM canonical_variants cv
        JOIN categories c ON c.id=cv.category_id
        JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id AND vo.vendor_id=$2::uuid
        JOIN vendor_locations vl ON vl.id=vo.location_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id
        WHERE cv.public_id=$1
          AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
          AND c.counteroffer_allowed=true
          AND vo.status='approved' AND vl.active=true
          AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $3
          AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) >= $4
        ORDER BY vo.updated_at DESC
        LIMIT 1
      `, [selectedCanonical, String(row.vendor_uuid), new Date(now), Number(row.requested_quantity ?? 1)]);
      candidate = candidates.rows[0];
    }
    if (!candidate) throw new Error("Το προϊόν δεν έχει αυτή τη στιγμή ενεργό, επιβεβαιωμένο απόθεμα για την ποσότητα του αιτήματος.");

    const publicId = `poffer_${randomUUID()}`;
    await tx.query(`
      INSERT INTO private_offers(
        id,public_id,counteroffer_request_id,vendor_id,canonical_variant_id,price_minor,currency,inclusions,
        fulfilment_promise,status,expires_at,created_at)
      VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,$6,'EUR','{}'::jsonb,$7::jsonb,'active',$8,$9)
    `, [randomUUID(), publicId, String(row.request_uuid), String(row.vendor_uuid), String(candidate.canonical_uuid), offer.priceMinor, JSON.stringify({ text: offer.fulfilmentPromise }), new Date(offer.expiresAt), new Date(now)]);
    await tx.query(`
      UPDATE counteroffer_requests
      SET canonical_variant_id=$2::uuid,assigned_offer_id=$3::uuid,status='offered',updated_at=$4,workflow_updated_at=$4
      WHERE id=$1::uuid
    `, [String(row.request_uuid), String(candidate.canonical_uuid), String(candidate.offer_uuid), new Date(now)]);

    if (row.customer_uuid) {
      await tx.query(`
        INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
        VALUES($1,$2,$3::uuid,'in_app','transactional','ask_local.offer_received','ask-local-offer-v2','el','Νέα ιδιωτική προσφορά',$4,$5::jsonb,'queued',$6,$7)
        ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      `, [randomUUID(), `notification_${randomUUID()}`, String(row.customer_uuid), `${(offer.priceMinor / 100).toFixed(2)} € · ${offer.fulfilmentPromise}`, JSON.stringify({ requestId, requestReference: row.reference_number, privateOfferId: publicId, expiresAt: offer.expiresAt, canonicalVariantId: selectedCanonical }), `ask-local-offer:${publicId}:customer`, new Date(now)]);
    }
  }, { isolation: "serializable" });
}

export async function vendorReopenAskLocalOffer(principal: SessionPrincipal, requestIdValue: string, now = Date.now()): Promise<void> {
  const vendorId = requireVendor(principal);
  const requestId = requestIdValue.trim();
  if (!requestId) throw new Error("Ask Local request is required.");
  if (!productionDatabaseConfigured()) throw new Error("Η ανάκληση προσφοράς δεν είναι διαθέσιμη σε προσωρινή λειτουργία.");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, vendorId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT cr.id::text AS request_uuid,cr.customer_user_id::text AS customer_uuid,cr.reference_number
      FROM counteroffer_requests cr
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      WHERE cr.public_id=$1 AND v.public_id=$2 AND cr.status='offered'
      FOR UPDATE OF cr
    `, [requestId, vendorId]);
    if (!found.rowCount) throw new Error("Δεν υπάρχει ενεργή προσφορά για ανάκληση.");
    const row = found.rows[0];
    await tx.query("UPDATE private_offers SET status='revoked' WHERE counteroffer_request_id=$1::uuid AND status='active'", [String(row.request_uuid)]);
    await tx.query("UPDATE counteroffer_requests SET status='awaiting_vendor',expires_at=$2,updated_at=$3,workflow_updated_at=$3 WHERE id=$1::uuid", [String(row.request_uuid), new Date(now + 24 * 60 * 60 * 1000), new Date(now)]);
    if (row.customer_uuid) {
      await tx.query(`
        INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
        VALUES($1,$2,$3::uuid,'in_app','transactional','ask_local.offer_revoked','ask-local-offer-v2','el','Η ιδιωτική προσφορά ανακλήθηκε','Το κατάστημα ετοιμάζει νέα προσφορά.',$4::jsonb,'queued',$5,$6)
        ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      `, [randomUUID(), `notification_${randomUUID()}`, String(row.customer_uuid), JSON.stringify({ requestId, requestReference: row.reference_number }), `ask-local-reopen:${requestId}:${now}`, new Date(now)]);
    }
  }, { isolation: "serializable" });
}
