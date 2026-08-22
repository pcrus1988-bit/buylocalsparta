import type { SessionPrincipal } from "@buy-local-sparta/core";
import { customerPrivateOfferCheckoutPreview, type CustomerPrivateOfferCheckoutPreview } from "./private-offer-checkout-service";
import { requireCustomerPrivateOfferInternalId } from "./customer-private-offer-action-token";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export async function customerPrivateOfferBrowserPreview(
  principal: SessionPrincipal,
  offerTokenOrLegacyId: string,
  now = Date.now()
): Promise<CustomerPrivateOfferCheckoutPreview | undefined> {
  const resolved = await requireCustomerPrivateOfferInternalId(principal, offerTokenOrLegacyId);
  const preview = await customerPrivateOfferCheckoutPreview(principal, resolved.internalId, now);
  if (!preview) return undefined;

  let requestReference = preview.requestId;
  let existingOrderReference = preview.existingOrderId;
  if (productionDatabaseConfigured()) {
    const runtime = getProductionPostgresRuntime();
    const refs = await runtime.sqlPool.query(`
      SELECT cr.reference_number,
             (
               SELECT o.order_number FROM order_lines ol
               JOIN customer_orders o ON o.id=ol.order_id
               WHERE ol.source_reference=po.public_id AND o.user_id=u.id
               ORDER BY o.created_at DESC LIMIT 1
             ) AS existing_order_reference
      FROM private_offers po
      JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id
      JOIN users u ON u.id=cr.customer_user_id
      WHERE po.public_id=$1 AND u.public_id=$2
      LIMIT 1
    `, [resolved.internalId, principal.userId]);
    if (!refs.rowCount) return undefined;
    requestReference = String(refs.rows[0].reference_number ?? "");
    existingOrderReference = refs.rows[0].existing_order_reference ? String(refs.rows[0].existing_order_reference) : undefined;
    if (!requestReference) throw new Error("Το Ask Local αίτημα δεν έχει δημόσια αναφορά.");
  }

  return {
    ...preview,
    offerId: resolved.actionToken,
    requestId: requestReference,
    existingOrderId: existingOrderReference
  };
}
