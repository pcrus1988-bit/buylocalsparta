import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { accountAuthSecret } from "./account-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const PREFIX = "offer_";

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

export function customerPrivateOfferActionToken(userId: string, privateOfferId: string): string {
  const digest = createHmac("sha256", accountAuthSecret())
    .update(`customer-private-offer:${userId}:${privateOfferId}`)
    .digest("base64url");
  return `${PREFIX}${digest}`;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function privateOfferTokenMatches(userId: string, privateOfferId: string, token: string): boolean {
  return safeEqual(customerPrivateOfferActionToken(userId, privateOfferId), token);
}

export async function requireCustomerPrivateOfferInternalId(principal: SessionPrincipal, value: string): Promise<{ internalId: string; actionToken: string }> {
  requireCustomer(principal);
  const candidate = value.trim();
  if (!candidate || candidate.length > 160) throw new Error("Η ιδιωτική προσφορά δεν είναι έγκυρη.");

  if (!productionDatabaseConfigured()) {
    const { customerAskLocalRequests } = await import("./ask-local-service");
    const requests = await customerAskLocalRequests(principal);
    for (const request of requests) {
      for (const offer of request.privateOffers) {
        if (offer.id === candidate || privateOfferTokenMatches(principal.userId, offer.id, candidate)) {
          return { internalId: offer.id, actionToken: customerPrivateOfferActionToken(principal.userId, offer.id) };
        }
      }
    }
    throw new Error("Η ιδιωτική προσφορά δεν βρέθηκε στον λογαριασμό σου.");
  }

  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query(`
    SELECT po.public_id
    FROM private_offers po
    JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id
    JOIN users u ON u.id=cr.customer_user_id
    WHERE u.public_id=$1
    ORDER BY po.created_at DESC,po.id DESC
  `, [principal.userId]);

  for (const row of result.rows) {
    const internalId = String(row.public_id ?? "");
    if (!internalId) continue;
    if (internalId === candidate || privateOfferTokenMatches(principal.userId, internalId, candidate)) {
      return { internalId, actionToken: customerPrivateOfferActionToken(principal.userId, internalId) };
    }
  }
  throw new Error("Η ιδιωτική προσφορά δεν βρέθηκε στον λογαριασμό σου.");
}
