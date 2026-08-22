export type CustomerNotificationNavigationInput = Readonly<{
  eventType: string;
  group: string;
  payload: Record<string, unknown>;
}>;

export type CustomerNotificationDestination = Readonly<{
  href: string;
  label: string;
  priority: "primary" | "secondary";
}>;

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 240) return undefined;
  return normalized;
}

function orderDestination(orderReference: string, eventType: string): CustomerNotificationDestination {
  const needsPayment = /(?:payment\.(?:failed|declined|requires_action|pending)|order\.pending_payment)/.test(eventType);
  return {
    href: `/account/orders/${encodeURIComponent(orderReference)}`,
    label: needsPayment ? "Συνέχιση πληρωμής" : "Άνοιγμα παραγγελίας",
    priority: needsPayment ? "primary" : "secondary"
  };
}

export function customerNotificationDestination(input: CustomerNotificationNavigationInput): CustomerNotificationDestination | undefined {
  const eventType = input.eventType.trim().toLowerCase();
  const orderReference = payloadString(input.payload, "orderReference");
  const legacyOrderId = payloadString(input.payload, "orderId");
  if (/^(order|payment|fulfilment|pickup|shipment|return)\./.test(eventType)) {
    if (orderReference) return orderDestination(orderReference, eventType);
    if (legacyOrderId) {
      return {
        href: "/account/orders",
        label: /(?:payment\.|order\.pending_payment)/.test(eventType) ? "Δες παραγγελίες" : "Άνοιγμα παραγγελιών",
        priority: "secondary"
      };
    }
  }

  if (/^(counteroffer|ask_local)\./.test(eventType) || input.group === "advice") {
    return { href: "/account/ask-local", label: "Άνοιγμα Ask Local", priority: "secondary" };
  }

  if (/^customer_support\./.test(eventType)) {
    return { href: "/account/support", label: "Άνοιγμα υποστήριξης", priority: "secondary" };
  }

  const canonicalVariantId = payloadString(input.payload, "canonicalVariantId");
  if (/^saved_product\./.test(eventType) && canonicalVariantId) {
    return { href: `/product/${encodeURIComponent(canonicalVariantId)}`, label: "Άνοιγμα προϊόντος", priority: "secondary" };
  }
  if (/^(saved_product|saved_search)\./.test(eventType) || input.group === "saved") {
    return { href: "/account/saved", label: "Άνοιγμα αποθηκευμένων", priority: "secondary" };
  }

  if (/^privacy\./.test(eventType)) {
    return { href: "/account/privacy", label: "Κέντρο ιδιωτικότητας", priority: "secondary" };
  }
  if (/^(account|security|auth)\./.test(eventType) || input.group === "account") {
    return { href: "/account/security", label: "Ασφάλεια λογαριασμού", priority: "secondary" };
  }

  if (["orders", "delivery", "returns"].includes(input.group)) {
    return { href: "/account/orders", label: "Δες παραγγελίες", priority: "secondary" };
  }

  return undefined;
}
