import { createHash } from "node:crypto";
import { formatMoney } from "@buy-local-sparta/core";
import { getAccountSession } from "../../../lib/account-session";
import { assertCustomerCsrf, createCustomerNotification } from "../../../lib/customer-state-runtime";
import { checkoutCustomer, postgresCommerceEnabled, syncPersistentCustomerCart } from "../../../lib/customer-commerce-runtime";
import { attachCustomerOrderAddresses, customerCheckoutProfile } from "../../../lib/customer-address-runtime";
import { redeemGiftCardForOrder } from "../../../lib/gift-card-service";
import { getProductionPostgresRuntime } from "../../../lib/postgres-runtime";
import { requireVivaPayments, vivaPaymentsEnabled } from "../../../lib/viva-runtime";

type CheckoutBody = Readonly<{ checkoutKey?: unknown; postcode?: unknown; fulfilmentMode?: unknown; items?: unknown; shipping?: unknown; billingAddressId?: unknown; deliveryAddressId?: unknown; giftCardId?: unknown }>;
type RawItem = Readonly<{ canonicalVariantId?: unknown; quantity?: unknown }>;
const VIVA_MINIMUM_AMOUNT_MINOR = 30;
function boundedString(value: unknown, fallback: string, maxLength: number): string { if (typeof value !== "string") return fallback; const trimmed = value.trim(); return trimmed && trimmed.length <= maxLength ? trimmed : fallback; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

async function assertCheckoutRequestIntegrity(
  runtime: ReturnType<typeof getProductionPostgresRuntime>,
  input: {
    checkoutKey: string;
    actorUserId: string;
    postcode: string;
    fulfilmentMode: "pickup" | "local_delivery" | "shipping";
    billingAddressId: string;
    deliveryAddressId?: string;
    items: readonly Readonly<{ canonicalVariantId: string; quantity: number }>[];
    shipping?: Readonly<{ provider?: "boxnow"; providerDestinationId?: string; recipientName?: string; recipientEmail?: string; recipientPhone?: string }>;
  }
): Promise<void> {
  const requestHash = sha256(JSON.stringify({
    postcode: input.postcode,
    fulfilmentMode: input.fulfilmentMode,
    billingAddressId: input.billingAddressId,
    deliveryAddressId: input.fulfilmentMode === "local_delivery" ? input.deliveryAddressId ?? null : null,
    items: [...input.items].map((item) => ({ canonicalVariantId: item.canonicalVariantId, quantity: item.quantity })).sort((a, b) => a.canonicalVariantId.localeCompare(b.canonicalVariantId)),
    shipping: input.fulfilmentMode === "shipping" ? {
      provider: input.shipping?.provider ?? null,
      providerDestinationId: input.shipping?.providerDestinationId ?? null,
      recipientName: input.shipping?.recipientName ?? null,
      recipientEmail: input.shipping?.recipientEmail ?? null,
      recipientPhone: input.shipping?.recipientPhone ?? null
    } : null
  }));
  const actorHash = sha256(input.actorUserId);
  const guard = await runtime.sqlPool.query(`
    INSERT INTO checkout_request_guards(checkout_key,actor_hash,request_hash,created_at,last_seen_at)
    VALUES($1,$2,$3,now(),now())
    ON CONFLICT(checkout_key) DO UPDATE SET last_seen_at=now()
    WHERE checkout_request_guards.actor_hash=EXCLUDED.actor_hash
      AND checkout_request_guards.request_hash=EXCLUDED.request_hash
    RETURNING checkout_key
  `, [input.checkoutKey, actorHash, requestHash]);
  if (!guard.rowCount) throw new Error("Αυτό το checkout έχει ήδη χρησιμοποιηθεί με διαφορετικά στοιχεία. Ανανέωσε το checkout και δοκίμασε ξανά.");
}

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
    const giftCardId = boundedString(body.giftCardId, "", 128) || undefined;
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
    if (!billingAddressId) throw new Error("Επίλεξε διεύθυνση τιμολόγησης.");
    const addressProfile = await customerCheckoutProfile(principal);
    if (!addressProfile.fullName || addressProfile.fullName.trim().split(/\s+/).length < 2) throw new Error("Συμπλήρωσε το πλήρες ονοματεπώνυμό σου πριν από την παραγγελία.");
    const billingAddress = addressProfile.addresses.find((address) => address.id === billingAddressId);
    if (!billingAddress) throw new Error("Η επιλεγμένη διεύθυνση τιμολόγησης δεν ανήκει στον λογαριασμό σου.");

    let postcode = billingAddress.postcode;
    let deliveryAddress = deliveryAddressId ? addressProfile.addresses.find((address) => address.id === deliveryAddressId) : undefined;
    if (fulfilmentMode === "local_delivery") {
      if (!deliveryAddressId || !deliveryAddress) throw new Error("Επίλεξε διεύθυνση παράδοσης για την τοπική παράδοση.");
      postcode = deliveryAddress.postcode;
    }
    if (!/^\d{5}$/.test(postcode)) throw new Error("Χρειάζεται έγκυρος πενταψήφιος ΤΚ.");

    let shipping: { provider?: "boxnow"; providerDestinationId?: string; providerDestinationLabel?: string; recipientName?: string; recipientEmail?: string; recipientPhone?: string } | undefined;
    if (fulfilmentMode === "shipping") {
      const raw = body.shipping && typeof body.shipping === "object" ? body.shipping as Record<string, unknown> : {};
      const provider = boundedString(raw.provider, "", 32);
      const providerDestinationId = boundedString(raw.providerDestinationId, "", 128);
      const providerDestinationLabel = boundedString(raw.providerDestinationLabel, "", 300);
      const providerDestinationPostcode = boundedString(raw.providerDestinationPostcode, "", 16);
      const recipientName = boundedString(raw.recipientName, addressProfile.fullName, 160);
      const recipientEmail = boundedString(raw.recipientEmail, principal.email, 254).toLowerCase();
      const recipientPhone = boundedString(raw.recipientPhone, billingAddress.phone ?? "", 40);
      if (provider !== "boxnow") throw new Error("Select a BOX NOW locker for shipping");
      if (!providerDestinationId || !providerDestinationPostcode) throw new Error("Select a BOX NOW locker with a valid postcode");
      if (!/^\d{5}$/.test(providerDestinationPostcode)) throw new Error("BOX NOW locker postcode is invalid");
      if (!recipientName || !recipientEmail || !recipientPhone) throw new Error("Recipient name, email and phone are required for BOX NOW shipping");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new Error("A valid recipient email is required");
      if (!/^\+?[0-9 ()-]{8,24}$/.test(recipientPhone)) throw new Error("A valid recipient phone is required");
      postcode = providerDestinationPostcode;
      shipping = { provider: "boxnow", providerDestinationId, providerDestinationLabel: providerDestinationLabel || undefined, recipientName, recipientEmail, recipientPhone };
      deliveryAddress = undefined;
    }

    const runtime = getProductionPostgresRuntime();
    await assertCheckoutRequestIntegrity(runtime, {
      checkoutKey,
      actorUserId: principal.userId,
      postcode,
      fulfilmentMode,
      billingAddressId,
      deliveryAddressId: fulfilmentMode === "local_delivery" ? deliveryAddress?.id : undefined,
      items,
      shipping
    });

    if (!giftCardId && vivaPaymentsEnabled() && fulfilmentMode === "pickup") {
      let pickupTotalMinor = 0;
      for (const item of items) {
        const availability = await runtime.customerCommerce.publicCanonicalAvailability(item.canonicalVariantId, { postcode, fulfilmentMode, quantity: item.quantity });
        if (!availability) throw new Error(`Product ${item.canonicalVariantId} is unavailable`);
        pickupTotalMinor += availability.product.priceMinor * item.quantity;
      }
      if (pickupTotalMinor < VIVA_MINIMUM_AMOUNT_MINOR) {
        return Response.json({ error: "Η ελάχιστη αξία παραγγελίας για online πληρωμή μέσω Viva είναι 0,30 €. Αύξησε την ποσότητα ή την αξία του καλαθιού και δοκίμασε ξανά." }, { status: 422 });
      }
    }

    const now = Date.now();
    const order = await checkoutCustomer({ checkoutKey, visitorKey, customerId: principal.userId, postcode, fulfilmentMode, items, shipping, now });
    await attachCustomerOrderAddresses(principal, { orderId: order.id, billingAddressId, deliveryAddressId: fulfilmentMode === "local_delivery" ? deliveryAddress?.id : undefined, now });

    if (giftCardId) {
      try {
        const redemption = await redeemGiftCardForOrder(principal, { giftCardId, orderId: order.id, now });
        await syncPersistentCustomerCart(principal, [], now).catch(() => undefined);
        await createCustomerNotification({ userId: principal.userId, eventType: "order.payment_confirmed", title: "Η πληρωμή με δωροκάρτα επιβεβαιώθηκε", body: `Παραγγελία ${order.id} · ${formatMoney(order.total)}`, payload: { orderId: order.id, giftCardId: redemption.card.id, amountMinor: redemption.amountMinor }, dedupeKey: `web-order:${order.id}:gift-card-confirmed`, now });
        return Response.json({ ...order, status: "confirmed", giftCard: { id: redemption.card.id, suffix: redemption.card.suffix, balanceMinor: redemption.card.balanceMinor, amountMinor: redemption.amountMinor }, payment: { provider: "gift_card", amountMinor: redemption.amountMinor } }, { status: 201 });
      } catch (error) {
        await syncPersistentCustomerCart(principal, items, now).catch(() => undefined);
        throw error;
      }
    }

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