import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { customerAskLocalRequests } from "./ask-local-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerPrivateOfferPurpose = "decision" | "checkout";
export type CustomerPrivateOfferResolution = Readonly<{
  offerId: string;
  requestReference: string;
}>;

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

function clean(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 180) throw new Error("Η ιδιωτική προσφορά δεν είναι έγκυρη.");
  return normalized;
}

export async function resolveCustomerPrivateOfferReference(
  principal: SessionPrincipal,
  value: string,
  purpose: CustomerPrivateOfferPurpose
): Promise<CustomerPrivateOfferResolution> {
  requireCustomer(principal);
  const identifier = clean(value);
  if (!productionDatabaseConfigured()) return resolveMemory(principal, identifier, purpose);

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const statusPredicate = purpose === "decision"
      ? "(po.status='active' AND cr.status='offered')"
      : "(po.status IN ('accepted','converted') AND cr.status IN ('accepted','converted'))";
    const result = await tx.query<SqlRow>(`
      SELECT po.public_id AS offer_public_id,cr.reference_number
      FROM private_offers po
      JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id
      JOIN users u ON u.id=cr.customer_user_id
      WHERE u.public_id=$2
        AND (po.public_id=$1 OR (cr.reference_number=$1 AND ${statusPredicate}))
      ORDER BY po.created_at DESC
      LIMIT 2
    `, [identifier, principal.userId]);
    if (result.rowCount !== 1) throw new Error("Η ιδιωτική προσφορά δεν βρέθηκε στον λογαριασμό σου ή δεν είναι πλέον διαθέσιμη.");
    const row = result.rows[0];
    const offerId = typeof row.offer_public_id === "string" ? row.offer_public_id : "";
    const requestReference = typeof row.reference_number === "string" ? row.reference_number : "";
    if (!offerId || !requestReference) throw new Error("Η ιδιωτική προσφορά δεν έχει έγκυρη δημόσια αναφορά.");
    return { offerId, requestReference };
  }, { readOnly: true });
}

async function resolveMemory(
  principal: SessionPrincipal,
  identifier: string,
  purpose: CustomerPrivateOfferPurpose
): Promise<CustomerPrivateOfferResolution> {
  const requests = await customerAskLocalRequests(principal);
  for (const request of requests) {
    const directLegacy = request.privateOffers.find((offer) => offer.id === identifier);
    const current = purpose === "decision"
      ? request.privateOffers.filter((offer) => offer.status === "active" && request.status === "offered")
      : request.privateOffers.filter((offer) => ["accepted", "converted"].includes(offer.status) && ["accepted", "converted"].includes(request.status));
    if (directLegacy) return { offerId: directLegacy.id, requestReference: request.referenceNumber };
    if (request.referenceNumber === identifier) {
      if (current.length !== 1) throw new Error("Η ιδιωτική προσφορά δεν είναι μοναδικά διαθέσιμη για αυτό το Ask Local αίτημα.");
      return { offerId: current[0].id, requestReference: request.referenceNumber };
    }
  }
  throw new Error("Η ιδιωτική προσφορά δεν βρέθηκε στον λογαριασμό σου ή δεν είναι πλέον διαθέσιμη.");
}
