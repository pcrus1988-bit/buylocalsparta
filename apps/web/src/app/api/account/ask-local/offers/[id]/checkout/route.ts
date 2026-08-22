import { formatMoney } from "@buy-local-sparta/core";
import { requireAccountSession } from "../../../../../../../lib/account-session";
import { attachCustomerOrderAddresses, customerCheckoutProfile } from "../../../../../../../lib/customer-address-runtime";
import { requireCustomerPrivateOfferInternalId } from "../../../../../../../lib/customer-private-offer-action-token";
import { createCustomerNotification } from "../../../../../../../lib/customer-state-runtime";
import { checkoutCustomerPrivateOffer } from "../../../../../../../lib/private-offer-checkout-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../../../lib/postgres-runtime";
import { getVisitorKey } from "../../../../../../../lib/visitor";
import { requireVivaPayments, vivaPaymentsEnabled } from "../../../../../../../lib/viva-runtime";

type Context = Readonly<{ params: Promise<{ id: string }> }>;
type Body = Readonly<{ checkoutKey?: unknown; billingAddressId?: unknown }>;

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === "string" && value.trim().length <= maxLength ? value.trim() : "";
}

async function publicOrderReference(orderId: string, userId: string): Promise<string> {
  const result = await getProductionPostgresRuntime().sqlPool.query(`
    SELECT co.order_number
    FROM customer_orders co
    JOIN users u ON u.id=co.user_id
    WHERE co.public_id=$1 AND u.public_id=$2
    LIMIT 1
  `, [orderId, userId]);
  const reference = result.rows[0]?.order_number ? String(result.rows[0].order_number) : "";
  if (!reference) throw new Error("Η παραγγελία δημιουργήθηκε χωρίς δημόσια αναφορά.");
  return reference;
}

export async function POST(request: Request, { params }: Context) {
  try {
    if (!productionDatabaseConfigured()) return Response.json({ error: "Private-offer checkout requires PostgreSQL" }, { status: 503 });
    if (process.env.NODE_ENV === "production" && !vivaPaymentsEnabled()) {
      return Response.json({ error: "Checkout requires the configured Viva Smart Checkout payment adapter" }, { status: 503 });
    }

    const principal = await requireAccountSession(request, true);
    if (!principal.roles.includes("customer")) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    const { id: offerToken } = await params;
    const resolvedOffer = await requireCustomerPrivateOfferInternalId(principal, offerToken);
    const body = await request.json() as Body;
    const checkoutKey = boundedString(body.checkoutKey, 128);
    const billingAddressId = boundedString(body.billingAddressId, 128);
    if (!/^[A-Za-z0-9-]{16,128}$/.test(checkoutKey)) throw new Error("Invalid checkout key");
    if (!billingAddressId) throw new Error("Επίλεξε διεύθυνση τιμολόγησης.");

    const profile = await customerCheckoutProfile(principal);
    if (!profile.fullName || profile.fullName.trim().split(/\s+/).length < 2) throw new Error("Συμπλήρωσε το πλήρες ονοματεπώνυμό σου πριν από την παραγγελία.");
    if (!profile.addresses.some((address) => address.id === billingAddressId)) throw new Error("Η επιλεγμένη διεύθυνση τιμολόγησης δεν ανήκει στον λογαριασμό σου.");

    const now = Date.now();
    const visitorKey = await getVisitorKey();
    const result = await checkoutCustomerPrivateOffer(principal, {
      offerId: resolvedOffer.internalId,
      checkoutKey,
      visitorKey,
      billingAddressId,
      now
    });
    const orderReference = await publicOrderReference(result.order.id, principal.userId);

    // Address snapshots may be repaired while payment is still pending, but never mutated
    // after authorisation/capture has moved the order past the payment gate.
    if (result.created || result.order.status === "pending_payment") {
      await attachCustomerOrderAddresses(principal, { orderId: result.order.id, billingAddressId, now });
    }
    if (result.created) {
      await createCustomerNotification({
        userId: principal.userId,
        eventType: result.order.status === "pending_payment" ? "order.pending_payment" : "order.authorised",
        title: result.order.status === "pending_payment" ? "Η ιδιωτική προσφορά έγινε παραγγελία" : "Η παραγγελία σου δημιουργήθηκε",
        body: `Παραγγελία ${orderReference} · ${formatMoney(result.order.total)}`,
        payload: { orderReference },
        dedupeKey: `private-offer-order:${resolvedOffer.internalId}:${result.order.status}`,
        now
      });
    }

    if (vivaPaymentsEnabled()) {
      const payment = await requireVivaPayments().initiateOrderPayment({ orderId: result.order.id, customerId: principal.userId, visitorKey, now });
      return Response.json({ id: orderReference, orderId: orderReference, status: result.order.status, payment: { provider: "viva", redirectUrl: payment.checkoutUrl, amountMinor: payment.amountMinor } }, { status: result.created ? 201 : 200 });
    }
    return Response.json({ id: orderReference, orderId: orderReference, status: result.order.status }, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "private_offer_checkout_failed";
    const status = message === "AUTH_REQUIRED" ? 401 : /δεν βρέθηκε|not found/i.test(message) ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
