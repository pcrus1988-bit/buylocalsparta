import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { customerAskLocalRequests, type AskLocalRequestView } from "./ask-local-service";
import { getProductionPostgresRuntime } from "./postgres-runtime";

type CustomerOfferAction = "accept" | "decline";
type PrivateOfferView = AskLocalRequestView["privateOffers"][number];

const memoryKey = "__blsAskLocalMemory" as const;
const globals = globalThis as typeof globalThis & { [memoryKey]?: Map<string, AskLocalRequestView[]> };

function postgresEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function memoryStore(): Map<string, AskLocalRequestView[]> {
  return globals[memoryKey] ??= new Map();
}

function requireVendor(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

function validateOffer(input: { priceMinor: number; fulfilmentPromise: string; expiresAt: number }, now: number) {
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 30 || input.priceMinor > 100_000_000) throw new Error("Η προσφορά πρέπει να είναι από 0,30 € έως 1.000.000 €.");
  const fulfilmentPromise = input.fulfilmentPromise.trim().replace(/\s+/g, " ");
  if (fulfilmentPromise.length < 3 || fulfilmentPromise.length > 500) throw new Error("Πρόσθεσε σύντομη και σαφή περιγραφή εκπλήρωσης.");
  if (!Number.isFinite(input.expiresAt) || input.expiresAt <= now + 5 * 60 * 1000) throw new Error("Η προσφορά πρέπει να ισχύει για τουλάχιστον 5 λεπτά.");
  if (input.expiresAt > now + 30 * 24 * 60 * 60 * 1000) throw new Error("Η προσφορά δεν μπορεί να ισχύει περισσότερο από 30 ημέρες.");
  return { priceMinor: input.priceMinor, fulfilmentPromise, expiresAt: input.expiresAt };
}

export async function vendorCreateAskLocalOffer(
  principal: SessionPrincipal,
  input: { requestId: string; priceMinor: number; fulfilmentPromise: string; expiresAt: number; now?: number }
): Promise<PrivateOfferView> {
  const vendorId = requireVendor(principal);
  const now = input.now ?? Date.now();
  const offer = validateOffer(input, now);
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error("Ask Local request is required.");

  if (!postgresEnabled()) return vendorCreateMemoryOffer(principal, vendorId, requestId, offer, now);

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  return uow.withTransaction({ actorUserId: principal.userId, vendorId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT cr.id::text AS request_uuid,cr.status::text,cr.expires_at,cr.customer_user_id::text AS customer_uuid,
             cr.canonical_variant_id::text AS canonical_uuid,v.id::text AS vendor_uuid
      FROM counteroffer_requests cr
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      WHERE cr.public_id=$1 AND v.public_id=$2
      FOR UPDATE OF cr
    `, [requestId, vendorId]);
    if (!found.rowCount) throw new Error("Το Ask Local αίτημα δεν είναι ανατεθειμένο σε αυτό το κατάστημα.");
    const row = found.rows[0];
    const status = String(row.status);
    if (!["awaiting_vendor", "needs_info"].includes(status)) throw new Error("Το αίτημα δεν δέχεται νέα προσφορά στην τρέχουσα κατάσταση.");
    if (row.expires_at && new Date(String(row.expires_at)).getTime() <= now) throw new Error("Η προθεσμία απάντησης του αιτήματος έχει λήξει.");

    const existing = await tx.query<SqlRow>("SELECT 1 FROM private_offers WHERE counteroffer_request_id=$1::uuid AND status='active' LIMIT 1", [String(row.request_uuid)]);
    if (existing.rowCount) throw new Error("Υπάρχει ήδη ενεργή ιδιωτική προσφορά για αυτό το αίτημα.");

    const publicId = `poffer_${randomUUID()}`;
    await tx.query(`
      INSERT INTO private_offers(
        id,public_id,counteroffer_request_id,vendor_id,canonical_variant_id,price_minor,currency,inclusions,
        fulfilment_promise,status,expires_at,created_at)
      VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,$6,'EUR','{}'::jsonb,$7::jsonb,'active',$8,$9)
    `, [randomUUID(), publicId, String(row.request_uuid), String(row.vendor_uuid), row.canonical_uuid ? String(row.canonical_uuid) : null, offer.priceMinor, JSON.stringify({ text: offer.fulfilmentPromise }), new Date(offer.expiresAt), new Date(now)]);
    await tx.query("UPDATE counteroffer_requests SET status='offered',updated_at=$2 WHERE id=$1::uuid", [String(row.request_uuid), new Date(now)]);

    if (row.customer_uuid) {
      await tx.query(`
        INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
        VALUES($1,$2,$3::uuid,'in_app','transactional','ask_local.offer_received','ask-local-offer-v1','el','Νέα ιδιωτική προσφορά',$4,$5::jsonb,'queued',$6,$7)
        ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      `, [randomUUID(), `notification_${randomUUID()}`, String(row.customer_uuid), `${(offer.priceMinor / 100).toFixed(2)} € · ${offer.fulfilmentPromise}`, JSON.stringify({ requestId, privateOfferId: publicId, expiresAt: offer.expiresAt }), `ask-local-offer:${publicId}:customer`, new Date(now)]);
    }

    return { id: publicId, status: "active", priceMinor: offer.priceMinor, currency: "EUR", fulfilmentPromise: offer.fulfilmentPromise, expiresAt: offer.expiresAt };
  }, { isolation: "serializable" });
}

export async function customerDecideAskLocalOffer(
  principal: SessionPrincipal,
  input: { offerId: string; action: CustomerOfferAction; now?: number }
): Promise<readonly AskLocalRequestView[]> {
  requireCustomer(principal);
  const now = input.now ?? Date.now();
  const offerId = input.offerId.trim();
  if (!offerId) throw new Error("Η ιδιωτική προσφορά είναι υποχρεωτική.");
  if (input.action !== "accept" && input.action !== "decline") throw new Error("Μη έγκυρη απόφαση προσφοράς.");

  if (!postgresEnabled()) {
    customerDecideMemoryOffer(principal, offerId, input.action, now);
    return customerAskLocalRequests(principal);
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  const result = await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT po.id::text AS offer_uuid,po.public_id,po.status,po.expires_at,po.vendor_id::text AS vendor_uuid,
             cr.id::text AS request_uuid,cr.public_id AS request_public_id,cr.status::text AS request_status,
             v.public_id AS vendor_public_id
      FROM private_offers po
      JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id
      JOIN users u ON u.id=cr.customer_user_id
      JOIN vendor_businesses v ON v.id=po.vendor_id
      WHERE po.public_id=$1 AND u.public_id=$2
      FOR UPDATE OF po,cr
    `, [offerId, principal.userId]);
    if (!found.rowCount) throw new Error("Η προσφορά δεν βρέθηκε στον λογαριασμό σου.");
    const row = found.rows[0];
    if (String(row.status) !== "active" || String(row.request_status) !== "offered") throw new Error("Η προσφορά δεν είναι πλέον ενεργή.");
    if (new Date(String(row.expires_at)).getTime() <= now) {
      await tx.query("UPDATE private_offers SET status='expired' WHERE id=$1::uuid", [String(row.offer_uuid)]);
      await tx.query("UPDATE counteroffer_requests SET status='expired',updated_at=$2 WHERE id=$1::uuid", [String(row.request_uuid), new Date(now)]);
      return { expired: true, vendorUuid: String(row.vendor_uuid), requestId: String(row.request_public_id) };
    }

    const next = input.action === "accept" ? "accepted" : "declined";
    await tx.query("UPDATE private_offers SET status=$2 WHERE id=$1::uuid", [String(row.offer_uuid), next]);
    if (input.action === "accept") {
      await tx.query("UPDATE private_offers SET status='revoked' WHERE counteroffer_request_id=$1::uuid AND id<>$2::uuid AND status='active'", [String(row.request_uuid), String(row.offer_uuid)]);
    }
    await tx.query("UPDATE counteroffer_requests SET status=$2::counteroffer_status,updated_at=$3 WHERE id=$1::uuid", [String(row.request_uuid), next, new Date(now)]);
    await tx.query(`
      INSERT INTO notifications(id,public_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3::uuid,'in_app','transactional',$4,'ask-local-offer-v1','el',$5,$6,$7::jsonb,'queued',$8,$9)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    `, [randomUUID(), `notification_${randomUUID()}`, String(row.vendor_uuid), input.action === "accept" ? "ask_local.offer_accepted" : "ask_local.offer_declined", input.action === "accept" ? "Η ιδιωτική προσφορά έγινε αποδεκτή" : "Η ιδιωτική προσφορά απορρίφθηκε", `Ask Local ${String(row.request_public_id)}`, JSON.stringify({ requestId: String(row.request_public_id), privateOfferId: offerId }), `ask-local-offer:${offerId}:vendor:${next}`, new Date(now)]);
    return { expired: false, vendorUuid: String(row.vendor_uuid), requestId: String(row.request_public_id) };
  }, { isolation: "serializable" });

  if (result.expired) throw new Error("Η προσφορά έχει λήξει.");
  return customerAskLocalRequests(principal);
}

function vendorCreateMemoryOffer(
  principal: SessionPrincipal,
  vendorId: string,
  requestId: string,
  offer: { priceMinor: number; fulfilmentPromise: string; expiresAt: number },
  now: number
): PrivateOfferView {
  for (const [customerId, requests] of memoryStore()) {
    const index = requests.findIndex((item) => item.id === requestId && item.assignedVendorId === vendorId);
    if (index < 0) continue;
    const request = requests[index];
    if (!["awaiting_vendor", "needs_info"].includes(request.status)) throw new Error("Το αίτημα δεν δέχεται νέα προσφορά στην τρέχουσα κατάσταση.");
    if (request.privateOffers.some((item) => item.status === "active")) throw new Error("Υπάρχει ήδη ενεργή ιδιωτική προσφορά για αυτό το αίτημα.");
    const created: PrivateOfferView = { id: `poffer_${randomUUID()}`, status: "active", priceMinor: offer.priceMinor, currency: "EUR", fulfilmentPromise: offer.fulfilmentPromise, expiresAt: offer.expiresAt };
    requests[index] = { ...request, status: "offered", privateOffers: [...request.privateOffers, created] };
    memoryStore().set(customerId, requests);
    return created;
  }
  throw new Error(`Το Ask Local αίτημα δεν είναι ανατεθειμένο στο ${principal.vendorId ?? "κατάστημα"}.`);
}

function customerDecideMemoryOffer(principal: SessionPrincipal, offerId: string, action: CustomerOfferAction, now: number): void {
  const requests = memoryStore().get(principal.userId) ?? [];
  const requestIndex = requests.findIndex((request) => request.privateOffers.some((offer) => offer.id === offerId));
  if (requestIndex < 0) throw new Error("Η προσφορά δεν βρέθηκε στον λογαριασμό σου.");
  const request = requests[requestIndex];
  const offerIndex = request.privateOffers.findIndex((offer) => offer.id === offerId);
  const offer = request.privateOffers[offerIndex];
  if (offer.status !== "active" || request.status !== "offered") throw new Error("Η προσφορά δεν είναι πλέον ενεργή.");
  if (offer.expiresAt <= now) {
    const nextOffers = request.privateOffers.map((item) => item.id === offerId ? { ...item, status: "expired" } : item);
    requests[requestIndex] = { ...request, status: "expired", privateOffers: nextOffers };
    memoryStore().set(principal.userId, requests);
    throw new Error("Η προσφορά έχει λήξει.");
  }
  const nextStatus = action === "accept" ? "accepted" : "declined";
  const nextOffers = request.privateOffers.map((item) => item.id === offerId ? { ...item, status: nextStatus } : action === "accept" && item.status === "active" ? { ...item, status: "revoked" } : item);
  requests[requestIndex] = { ...request, status: nextStatus, privateOffers: nextOffers };
  memoryStore().set(principal.userId, requests);
}
