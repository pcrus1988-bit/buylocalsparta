import { formatMoney } from "@buy-local-sparta/core";
import { getAccountSession } from "../../../lib/account-session";
import { assertCustomerCsrf, createCustomerNotification } from "../../../lib/customer-state-runtime";
import { checkoutCustomer, postgresCommerceEnabled } from "../../../lib/customer-commerce-runtime";
import { attachCustomerOrderAddresses, customerCheckoutProfile } from "../../../lib/customer-address-runtime";
import { attachCheckoutFiscalSnapshot, buildCheckoutFiscalSnapshot, checkoutFiscalPreference } from "../../../lib/fiscal-checkout-runtime";
import { requireVivaPayments, vivaPaymentsEnabled } from "../../../lib/viva-runtime";

type CheckoutBody = Readonly<{ checkoutKey?: unknown; postcode?: unknown; fulfilmentMode?: unknown; items?: unknown; shipping?: unknown; billingAddressId?: unknown; deliveryAddressId?: unknown }>;
type RawItem = Readonly<{ canonicalVariantId?: unknown; quantity?: unknown }>;
function boundedString(value: unknown, fallback: string, maxLength: number): string { if (typeof value !== "string") return fallback; const trimmed = value.trim(); return trimmed && trimmed.length <= maxLength ? trimmed : fallback; }

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production" && postgresCommerceEnabled() && !vivaPaymentsEnabled()) {
      return Response.json({ error: "Checkout requires the configured Viva Smart Checkout payment adapter" }, { status: 503 });
    }
    if (vivaPaymentsEnabled() && !postgresCommerceEnabled()) {
      return Response.json({ error: "Viva payments require the PostgreSQL commerce runtime" }, { status: 503 });
    }
    if (!postgresCommerceEnabled()) {
      return Response.json({ error: "Checkout requires the PostgreSQL customer address runtime" }, { status: 503 });
    }

    const body = await request.json() as CheckoutBody;
    const checkoutKey = boundedString(body.checkoutKey, "", 128);
    if (!checkoutKey) throw new Error("checkoutKey is required");
    const visitorKey = request.headers.get("x-bls-visitor")?.trim();
    if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) throw new Error("Trusted visitor identity is required");
    if (body.fulfilmentMode !== "pickup" && body.fulfilmentMode !== "local_delivery" && body.fulfilmentMode !== "shipping") throw new Error("A valid fulfilment mode is required");
    const fulfilmentMode = body.fulfilmentMode;
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) throw new Error("Checkout requires between 1 and 100 items");
    const items = body.items.map((raw) => {
      const item = raw as RawItem;
      const canonicalVariantId = boundedString(item.canonicalVariantId, "", 128);
      const quantity = Number(item.quantity);
      if (!canonicalVariantId) throw new Error("canonicalVariantId is required");
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 99) throw new Error("Invalid checkout quantity");
      return { canonicalVariantId, quantity };
    });

    const principal = await getAccountSession();
    if (!principal?.roles.includes("customer")) {
      return Response.json({ error: "Συνδέσου στον λογαριασμό σου για να ολοκληρώσεις την παραγγελία." }, { status: 401 });
    }
    assertCustomerCsrf(principal, request.headers.get("x-csrf-token") ?? undefined);

    const billingAddressId = boundedString(body.billingAddressId, "", 128);
    const deliveryAddressId = boundedString(body.deliveryAddressId, "", 128);
    if (!billingAddressId || !deliveryAddressId) throw new Error("Επίλεξε διεύθυνση τιμολόγησης και διεύθυνση παράδοσης.");
    const addressProfile = await customerCheckoutProfile(principal);
    if (!addressProfile.fullName || addressProfile.fullName.trim().split(/\s+/).length < 2) throw new Error("Συμπλήρωσε το πλήρες ονοματεπώνυμό σου πριν από την παραγγελία.");
    const billingAddress = addressProfile.addresses.find((address) => address.id === billingAddressId);
    const deliveryAddress = addressProfile.addresses.find((address) => address.id === deliveryAddressId);
    if (!billingAddress || !deliveryAddress) throw new Error("Η επιλεγμένη διεύθυνση δεν ανήκει στον λογαριασμό σου.");
    const postcode = deliveryAddress.postcode;
    if (!/^\d{5}$/.test(postcode)) throw new Error("Η διεύθυνση παράδοσης χρειάζεται έγκυρο πενταψήφιο ΤΚ.");

    let shipping: { provider?: "boxnow"; providerDestinationId?: string; providerDestinationLabel?: string; recipientName?: string; recipientEmail?: string; recipientPhone?: string } | undefined;
    if (fulfilmentMode === "shipping") {
      const raw = body.shipping && typeof body.shipping === "object" ? body.shipping as Record<string, unknown> : {};
      const provider = boundedString(raw.provider, "", 32);
      const providerDestinationId = boundedString(raw.providerDestinationId, "", 128);
      const providerDestinationLabel = boundedString(raw.providerDestinationLabel, "", 300);
      const recipientName = boundedString(raw.recipientName, deliveryAddress.fullName || addressProfile.fullName, 160);
      const recipientEmail = boundedString(raw.recipientEmail, principal.email, 254).toLowerCase();
      const recipientPhone = boundedString(raw.recipientPhone, deliveryAddress.phone ?? "", 40);
      if (process.env.BLS_BOXNOW_ENABLED === "true") {
        if (provider !== "boxnow" || !providerDestinationId) throw new Error("Select a BOX NOW locker for shipping");
        if (!recipientName || !recipientEmail || !recipientPhone) throw new Error("Recipient name, email and phone are required for BOX NOW shipping");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new Error("A valid recipient email is required");
        if (!/^\+?[0-9 ()-]{8,24}$/.test(recipientPhone)) throw new Error("A valid recipient phone is required");
      }
      shipping = { provider: provider === "boxnow" ? "boxnow" : undefined, providerDestinationId: providerDestinationId || undefined, providerDestinationLabel: providerDestinationLabel || undefined, recipientName: recipientName || undefined, recipientEmail: recipientEmail || undefined, recipientPhone: recipientPhone || undefined };
    }

    const now = Date.now();
    const fiscalSnapshot = buildCheckoutFiscalSnapshot({ documentType: checkoutFiscalPreference(request), billingAddress, email: principal.email, now });
    const order = await checkoutCustomer({ checkoutKey, visitorKey, customerId: principal.userId, postcode, fulfilmentMode, items, shipping, now });
    await attachCustomerOrderAddresses(principal, { orderId: order.id, billingAddressId, deliveryAddressId, now });
    await attachCheckoutFiscalSnapshot(principal, { orderId: order.id, snapshot: fiscalSnapshot, now });

    const eventType = order.status === "pending_payment" ? "order.pending_payment" : "order.authorised";
    await createCustomerNotification({ userId: principal.userId, eventType, title: order.status === "pending_payment" ? "Η παραγγελία σου καταχωρήθηκε" : "Η παραγγελία σου δημιουργήθηκε", body: `Παραγγελία ${order.id} · ${formatMoney(order.total)}`, payload: { orderId: order.id }, dedupeKey: `web-order:${order.id}:${order.status}`, now });
    if (postgresCommerceEnabled() && vivaPaymentsEnabled()) {
      const payment = await requireVivaPayments().initiateOrderPayment({ orderId: order.id, customerId: principal.userId, visitorKey, now });
      return Response.json({ ...order, payment: { provider:"viva", orderCode:payment.orderCode, redirectUrl:payment.checkoutUrl, amountMinor:payment.amountMinor } }, { status: 201 });
    }
    return Response.json(order, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "checkout_failed" }, { status: 400 });
  }
}
