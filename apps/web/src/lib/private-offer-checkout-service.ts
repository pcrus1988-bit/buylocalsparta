import { createHash, randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  id,
  money,
  splitGrossTax,
  type CustomerOrder,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const RESERVATION_TTL_MS = 15 * 60 * 1000;

export type CustomerPrivateOfferCheckoutPreview = Readonly<{
  offerId: string;
  requestId: string;
  status: string;
  requestStatus: string;
  canonicalVariantId?: string;
  title: string;
  vendorId: string;
  vendorName: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
  currency: "EUR";
  fulfilmentPromise?: string;
  expiresAt: number;
  pickupOnly: true;
  purchasable: boolean;
  unavailableReason?: string;
  existingOrderId?: string;
}>;

export type CustomerPrivateOfferCheckoutResult = Readonly<{
  order: CustomerOrder;
  created: boolean;
}>;

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${field}`);
  return value;
}
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}
function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}
function epoch(value: unknown, field: string): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function orderNumber(now: number): string {
  const day = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
  return `BLS-${day}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

function ensureCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
  if (!productionDatabaseConfigured()) throw new Error("Private-offer checkout requires PostgreSQL");
}

function unavailableReason(row: SqlRow, now: number): string | undefined {
  const offerStatus = String(row.offer_status ?? "");
  const requestStatus = String(row.request_status ?? "");
  if (offerStatus === "converted" && row.existing_order_id) return "Η προσφορά έχει ήδη μετατραπεί σε παραγγελία.";
  if (offerStatus !== "accepted" || requestStatus !== "accepted") return "Η προσφορά πρέπει πρώτα να γίνει αποδεκτή.";
  if (epoch(row.expires_at, "private_offer.expires_at") <= now) return "Η ιδιωτική προσφορά έχει λήξει.";
  if (!row.canonical_public_id) return "Η προσφορά δεν έχει ακόμη συνδεθεί με συγκεκριμένο προϊόν.";
  if (!row.assigned_offer_public_id || String(row.assigned_offer_status ?? "") !== "approved") return "Το κατάστημα δεν έχει ενεργή εγκεκριμένη προσφορά αποθέματος για αυτό το προϊόν.";
  if (String(row.vendor_status ?? "") !== "active" || row.location_active !== true) return "Το κατάστημα ή το σημείο εκπλήρωσης δεν είναι ενεργό.";
  if (row.pickup_supported !== true) return "Η συγκεκριμένη ιδιωτική προσφορά δεν είναι διαθέσιμη για ασφαλή online ολοκλήρωση με παραλαβή από κατάστημα.";
  if (row.stock_fresh !== true) return "Η επιβεβαίωση αποθέματος χρειάζεται ανανέωση από το κατάστημα.";
  if (integer(row.available_to_sell ?? 0, "available_to_sell") < integer(row.requested_quantity, "requested_quantity")) return "Δεν υπάρχει πλέον αρκετό επιβεβαιωμένο απόθεμα για την ποσότητα του αιτήματος.";
  return undefined;
}

async function previewRow(principal: SessionPrincipal, offerId: string): Promise<SqlRow | undefined> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT po.public_id AS offer_public_id,po.status AS offer_status,po.price_minor,po.currency,po.expires_at,
             po.fulfilment_promise->>'text' AS fulfilment_promise,
             cr.public_id AS request_public_id,cr.status::text AS request_status,cr.requested_quantity,
             cv.public_id AS canonical_public_id,COALESCE(el.title,en.title,cv.model,cv.slug,'Ιδιωτική προσφορά') AS title,
             v.public_id AS vendor_public_id,v.trading_name AS vendor_name,v.status::text AS vendor_status,
             vo.public_id AS assigned_offer_public_id,vo.status::text AS assigned_offer_status,
             COALESCE('pickup'::fulfilment_mode=ANY(vo.fulfilment_modes),false) AS pickup_supported,
             COALESCE(vl.active,false) AS location_active,
             COALESCE(GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked),0)::int AS available_to_sell,
             COALESCE(ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > now(),false) AS stock_fresh,
             (
               SELECT o.public_id FROM order_lines ol
               JOIN customer_orders o ON o.id=ol.order_id
               WHERE ol.source_reference=po.public_id AND o.user_id=u.id
               ORDER BY o.created_at DESC LIMIT 1
             ) AS existing_order_id
      FROM private_offers po
      JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id
      JOIN users u ON u.id=cr.customer_user_id
      JOIN vendor_businesses v ON v.id=po.vendor_id
      LEFT JOIN canonical_variants cv ON cv.id=po.canonical_variant_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN vendor_offers vo ON vo.id=cr.assigned_offer_id AND vo.vendor_id=po.vendor_id AND vo.canonical_variant_id=po.canonical_variant_id
      LEFT JOIN vendor_locations vl ON vl.id=vo.location_id
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE po.public_id=$1 AND u.public_id=$2
      LIMIT 1
    `, [offerId, principal.userId]);
    return result.rows[0];
  }, { readOnly: true });
}

export async function customerPrivateOfferCheckoutPreview(
  principal: SessionPrincipal,
  offerIdValue: string,
  now = Date.now()
): Promise<CustomerPrivateOfferCheckoutPreview | undefined> {
  ensureCustomer(principal);
  const offerId = offerIdValue.trim();
  if (!offerId) return undefined;
  const row = await previewRow(principal, offerId);
  if (!row) return undefined;
  const quantity = integer(row.requested_quantity, "requested_quantity");
  const unitPriceMinor = integer(row.price_minor, "price_minor");
  const reason = unavailableReason(row, now);
  return {
    offerId: text(row.offer_public_id, "private_offer.public_id"),
    requestId: text(row.request_public_id, "counteroffer_request.public_id"),
    status: String(row.offer_status),
    requestStatus: String(row.request_status),
    canonicalVariantId: optionalText(row.canonical_public_id),
    title: text(row.title, "title"),
    vendorId: text(row.vendor_public_id, "vendor.public_id"),
    vendorName: text(row.vendor_name, "vendor.trading_name"),
    quantity,
    unitPriceMinor,
    totalMinor: unitPriceMinor * quantity,
    currency: "EUR",
    fulfilmentPromise: optionalText(row.fulfilment_promise),
    expiresAt: epoch(row.expires_at, "private_offer.expires_at"),
    pickupOnly: true,
    purchasable: !reason,
    unavailableReason: reason,
    existingOrderId: optionalText(row.existing_order_id)
  };
}

export async function checkoutCustomerPrivateOffer(
  principal: SessionPrincipal,
  input: { offerId: string; checkoutKey: string; visitorKey: string; billingAddressId: string; now?: number }
): Promise<CustomerPrivateOfferCheckoutResult> {
  ensureCustomer(principal);
  const offerId = input.offerId.trim();
  const checkoutKey = input.checkoutKey.trim();
  const visitorKey = input.visitorKey.trim();
  const billingAddressId = input.billingAddressId.trim();
  const now = input.now ?? Date.now();
  if (!offerId || offerId.length > 160) throw new Error("Invalid private offer");
  if (!/^[A-Za-z0-9-]{16,128}$/.test(checkoutKey)) throw new Error("Invalid checkout key");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) throw new Error("Invalid visitor identity");
  if (!billingAddressId || billingAddressId.length > 128) throw new Error("Billing address is required");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  const outcome = await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const existingByOffer = await tx.query<SqlRow>(`
      SELECT o.public_id FROM order_lines ol
      JOIN customer_orders o ON o.id=ol.order_id
      JOIN users u ON u.id=o.user_id
      WHERE ol.source_reference=$1 AND u.public_id=$2
      ORDER BY o.created_at DESC LIMIT 1
      FOR UPDATE OF o
    `, [offerId, principal.userId]);
    if (existingByOffer.rowCount) return { orderId: text(existingByOffer.rows[0].public_id, "order.public_id"), created: false };

    const found = await tx.query<SqlRow>(`
      SELECT po.id::text AS private_offer_uuid,po.public_id AS private_offer_public_id,po.status AS offer_status,
             po.price_minor,po.currency,po.expires_at,po.fulfilment_promise,
             cr.id::text AS request_uuid,cr.public_id AS request_public_id,cr.status::text AS request_status,cr.requested_quantity,
             u.id::text AS customer_uuid,cv.id::text AS canonical_uuid,cv.public_id AS canonical_public_id,
             cv.tax_rate_bps,cv.active AS canonical_active,cv.suppressed,cv.recalled,
             COALESCE(el.title,en.title,cv.model,cv.slug) AS title,c.code AS category_code,m.id::text AS market_uuid,m.code AS market_code,
             v.id::text AS vendor_uuid,v.public_id AS vendor_public_id,v.status::text AS vendor_status,
             vo.id::text AS assigned_offer_uuid,vo.public_id AS assigned_offer_public_id,vo.status::text AS assigned_offer_status,
             vo.supplier_unit_price_minor,vo.supplier_tax_rate_bps,vo.fulfilment_modes,
             vl.id::text AS location_uuid,vl.public_id AS location_public_id,vl.active AS location_active,
             GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)::int AS available_to_sell,
             ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $3 AS stock_fresh
      FROM private_offers po
      JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id
      JOIN users u ON u.id=cr.customer_user_id
      JOIN canonical_variants cv ON cv.id=po.canonical_variant_id AND cv.id=cr.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      JOIN markets m ON m.id=cv.market_id
      JOIN vendor_businesses v ON v.id=po.vendor_id AND v.id=cr.assigned_vendor_id
      JOIN vendor_offers vo ON vo.id=cr.assigned_offer_id AND vo.vendor_id=po.vendor_id AND vo.canonical_variant_id=po.canonical_variant_id
      JOIN vendor_locations vl ON vl.id=vo.location_id
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE po.public_id=$1 AND u.public_id=$2
      FOR UPDATE OF po,cr,vo,ib
    `, [offerId, principal.userId, new Date(now)]);
    if (!found.rowCount) throw new Error("Η αποδεκτή προσφορά δεν είναι συνδεδεμένη με ενεργό προϊόν και απόθεμα.");
    const row = found.rows[0];
    if (String(row.offer_status) !== "accepted" || String(row.request_status) !== "accepted") throw new Error("Η ιδιωτική προσφορά δεν είναι σε κατάσταση αγοράς.");
    if (epoch(row.expires_at, "private_offer.expires_at") <= now) throw new Error("Η ιδιωτική προσφορά έχει λήξει.");
    if (row.canonical_active !== true || row.suppressed === true || row.recalled === true) throw new Error("Το προϊόν δεν είναι διαθέσιμο για αγορά.");
    if (String(row.vendor_status) !== "active" || String(row.assigned_offer_status) !== "approved" || row.location_active !== true) throw new Error("Η προσφορά του καταστήματος δεν είναι πλέον ενεργή.");
    const modes = Array.isArray(row.fulfilment_modes) ? row.fulfilment_modes.map(String) : String(row.fulfilment_modes ?? "");
    if (!modes.includes("pickup")) throw new Error("Η ιδιωτική προσφορά δεν υποστηρίζει ασφαλή online ολοκλήρωση με παραλαβή.");
    if (row.stock_fresh !== true) throw new Error("Το απόθεμα χρειάζεται νέα επιβεβαίωση από το κατάστημα.");

    const quantity = integer(row.requested_quantity, "requested_quantity");
    const available = integer(row.available_to_sell, "available_to_sell");
    if (quantity <= 0 || available < quantity) throw new Error("Δεν υπάρχει αρκετό διαθέσιμο απόθεμα για την αποδεκτή ποσότητα.");
    const unitPriceMinor = integer(row.price_minor, "private_offer.price_minor");
    if (unitPriceMinor < 30) throw new Error("Η ιδιωτική προσφορά είναι κάτω από το ελάχιστο ποσό online πληρωμής.");
    if (String(row.currency) !== "EUR") throw new Error("Μη υποστηριζόμενο νόμισμα ιδιωτικής προσφοράς.");

    const replay = await tx.query<SqlRow>(`
      SELECT o.public_id,ol.source_reference FROM customer_orders o
      JOIN users u ON u.id=o.user_id
      LEFT JOIN order_lines ol ON ol.order_id=o.id
      WHERE o.checkout_key=$1 AND u.public_id=$2
      LIMIT 1 FOR UPDATE OF o
    `, [checkoutKey, principal.userId]);
    if (replay.rowCount) {
      if (String(replay.rows[0].source_reference ?? "") !== offerId) throw new Error("Αυτό το checkout key έχει ήδη χρησιμοποιηθεί για διαφορετική αγορά.");
      return { orderId: text(replay.rows[0].public_id, "order.public_id"), created: false };
    }

    const marketUuid = text(row.market_uuid, "market_uuid");
    const vendorOfferUuid = text(row.assigned_offer_uuid, "assigned_offer_uuid");
    const reservation = await tx.query<SqlRow>(`SELECT r.public_id FROM reserve_stock($1,$2,$3,$4,$5,$6,$7) r`, [
      marketUuid, checkoutKey, vendorOfferUuid, null, quantity, new Date(now), new Date(now + RESERVATION_TTL_MS)
    ]);
    const reservationId = text(reservation.rows[0]?.public_id, "reservation.public_id");

    const canonicalUuid = text(row.canonical_uuid, "canonical_uuid");
    const customerUuid = text(row.customer_uuid, "customer_uuid");
    const vendorUuid = text(row.vendor_uuid, "vendor_uuid");
    const locationUuid = text(row.location_uuid, "location_uuid");
    const merchandiseMinor = unitPriceMinor * quantity;
    const taxRateBps = integer(row.tax_rate_bps, "tax_rate_bps");
    const taxMinor = splitGrossTax(money(merchandiseMinor), taxRateBps).tax.minor;
    const developmentAuthorised = process.env.NODE_ENV !== "production" && process.env.BLS_ALLOW_DEVELOPMENT_PAYMENT_ADAPTER === "true";
    const orderStatus = developmentAuthorised ? "authorised" : "pending_payment";
    const paymentStatus = developmentAuthorised ? "authorised" : "created";
    const orderUuid = randomUUID();
    const orderId = id("ord");
    const lineUuid = randomUUID();
    const lineId = id("line");
    const fulfilmentUuid = randomUUID();
    const fulfilmentId = id("ful");
    const fingerprint = hash(JSON.stringify({ customerId: principal.userId, offerId, quantity, billingAddressId, fulfilmentMode: "pickup" }));

    await tx.query(`INSERT INTO customer_orders(
      id,public_id,order_number,market_id,user_id,visitor_hash,checkout_key,checkout_fingerprint,status,currency,
      subtotal_minor,shipping_minor,discount_minor,tax_minor,total_minor,billing_address_snapshot,shipping_address_snapshot,
      fulfilment_preference,partial_fulfilment_allowed,terms_version,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'EUR',$10,0,0,$11,$10,$12::jsonb,'null'::jsonb,'pickup',false,'web-private-offer-v1',$13,$13)`, [
      orderUuid, orderId, orderNumber(now), marketUuid, customerUuid, hash(visitorKey), checkoutKey, fingerprint, orderStatus,
      merchandiseMinor, taxMinor, JSON.stringify({ source: "private_offer_checkout", billingAddressId }), new Date(now)
    ]);

    await tx.query(`INSERT INTO order_lines(
      id,public_id,order_id,canonical_variant_id,assigned_offer_id,vendor_id,location_id,quantity,product_snapshot,
      retail_unit_price_minor,tax_rate_bps,tax_minor,supplier_unit_price_minor,supplier_tax_rate_bps,shipping_promise_snapshot,
      attribution_snapshot,status,fulfilled_quantity,refunded_quantity,adjustment_refunded_minor,pricing_source,source_reference,discount_allocation_minor,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,'awaiting_vendor',0,0,0,'private_offer',$17,0,$18)`, [
      lineUuid, lineId, orderUuid, canonicalUuid, vendorOfferUuid, vendorUuid, locationUuid, quantity,
      JSON.stringify({ title: text(row.title, "title"), categoryCode: text(row.category_code, "category_code"), pricingSource: "private_offer", privateOfferId: offerId, askLocalRequestId: text(row.request_public_id, "request_public_id") }),
      unitPriceMinor, taxRateBps, taxMinor, integer(row.supplier_unit_price_minor, "supplier_unit_price_minor"), integer(row.supplier_tax_rate_bps, "supplier_tax_rate_bps"),
      JSON.stringify({ mode: "pickup", privateOfferPromise: row.fulfilment_promise ?? {} }),
      JSON.stringify({ privateOfferId: offerId, askLocalRequestId: text(row.request_public_id, "request_public_id"), assignedOfferId: text(row.assigned_offer_public_id, "assigned_offer_public_id"), vendorId: text(row.vendor_public_id, "vendor_public_id"), assignment: "accepted_private_offer" }),
      offerId, new Date(now)
    ]);
    await tx.query("UPDATE stock_reservations SET order_line_id=$1 WHERE public_id=$2", [lineUuid, reservationId]);

    await tx.query(`INSERT INTO fulfilment_orders(
      id,public_id,fulfilment_number,order_id,vendor_id,location_id,mode,status,merchandise_subtotal_minor,delivery_charge_minor,
      waived_delivery_minor,delivery_rule_id,delivery_rule_version,delivery_quote_public_id,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,'pickup','awaiting_acceptance',$7,0,0,NULL,NULL,$8,$9,$9)`, [
      fulfilmentUuid, fulfilmentId, `FUL-${fulfilmentId.slice(-12).toUpperCase()}`, orderUuid, vendorUuid, locationUuid, merchandiseMinor, id("delivery-quote"), new Date(now)
    ]);
    await tx.query("INSERT INTO fulfilment_order_lines(fulfilment_order_id,order_line_id) VALUES($1,$2)", [fulfilmentUuid, lineUuid]);

    await tx.query(`INSERT INTO payments(id,public_id,order_id,provider,provider_payment_id,idempotency_key,status,currency,authorised_minor,captured_minor,refunded_minor,created_at,updated_at)
      VALUES($1,$2,$3,$4,NULL,$5,$6,'EUR',$7,0,0,$8,$8)`, [
      randomUUID(), id("pay"), orderUuid, developmentAuthorised ? "development" : "pending_psp", `private-offer:${offerId}`, paymentStatus,
      developmentAuthorised ? merchandiseMinor : 0, new Date(now)
    ]);

    await tx.query("UPDATE private_offers SET status='converted' WHERE id=$1::uuid", [text(row.private_offer_uuid, "private_offer_uuid")]);
    await tx.query("UPDATE counteroffer_requests SET status='converted',updated_at=$2 WHERE id=$1::uuid", [text(row.request_uuid, "request_uuid"), new Date(now)]);
    await tx.query(`INSERT INTO analytics_events(id,public_id,market_id,event_name,occurred_at,visitor_hash,customer_id,vendor_id,canonical_variant_id,quantity,metadata,dedupe_key,retention_until)
      VALUES($1,$2,$3,'counteroffer.converted',$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [
      randomUUID(), `analytics_${randomUUID()}`, marketUuid, new Date(now), hash(visitorKey), customerUuid, vendorUuid, canonicalUuid, quantity,
      JSON.stringify({ requestId: text(row.request_public_id, "request_public_id"), privateOfferId: offerId, orderId, pricingSource: "private_offer" }),
      `private-offer-converted:${offerId}`, new Date(now + 400 * 24 * 60 * 60 * 1000)
    ]);
    return { orderId, created: true };
  }, { isolation: "serializable" });

  const order = await runtime.customerCommerce.orderForCustomer(principal.userId, outcome.orderId);
  if (!order) throw new Error("Η παραγγελία δημιουργήθηκε αλλά δεν ήταν δυνατή η επαναφόρτωσή της.");
  return { order, created: outcome.created };
}
