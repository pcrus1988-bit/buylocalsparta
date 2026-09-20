import { existsSync, readFileSync } from "node:fs";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const failures: string[] = [];

const page = read("apps/web/src/app/checkout/page.tsx");
const client = read("apps/web/src/components/CheckoutPageClient.tsx");
const cart = read("apps/web/src/app/cart/page.tsx");
const paymentSecurity = read("apps/web/src/app/payments-security/page.tsx");
const checkoutRoute = read("apps/web/src/app/api/checkout/route.ts");
const mollieWebhook = read("apps/web/src/app/api/payments/mollie/webhook/route.ts");
const layout = read("apps/web/src/app/layout.tsx");
const dropshipPricing = read("apps/web/src/lib/dropship-delivery-pricing.ts");
const dropshipCheckout = read("apps/web/src/lib/dropship-checkout-runtime.ts");

if (!page.includes("molliePaymentsProviderReadiness()") || !page.includes("mollie.enabled && mollie.ready")) failures.push("Checkout page must derive production payment availability from Mollie provider readiness, not optimistic UI copy");
if (!page.includes('paymentMode !== "unavailable"')) failures.push("Checkout page must expose an explicit unavailable payment state");
if (!page.includes('robots: { index: false, follow: false }')) failures.push("Checkout must remain a noindex utility route");
if (!page.includes('process.env.BLS_BOXNOW_ENABLED === "true"') || !page.includes('process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED === "true"')) failures.push("Checkout page must require both BOX NOW backend and widget enablement before offering locker shipping");
if (!client.includes("checkout-availability-gate") || !client.includes("if (!checkoutEnabled)")) failures.push("Checkout client must fail closed with a clear availability gate");
if (!client.includes("if (boxNowEnabled && !partnerOnlyCart) fulfilmentOptions.push")) failures.push("Checkout fulfilment choices must omit BOX NOW for dropshipping orders and when the provider is disabled");
if (!client.includes('paymentMode === "mollie"')) failures.push("Checkout payment copy must reflect the actual Mollie payment mode");
if (!client.includes('body.payment?.provider === "mollie"') || !client.includes("window.location.assign(body.payment.redirectUrl)")) failures.push("Checkout client must follow only the Mollie hosted-payment redirect");
if (!client.includes("const identityReady = checkoutEnabled") || !client.includes("if (!identityReady)")) failures.push("Disabled or incompletely hydrated checkout must not create an idempotency key as if a transaction could proceed");
if (!client.includes("partnerOnlyCart") || !client.includes("mixedFulfilmentCart") || !client.includes("Αποστολή συνεργαζόμενου προμηθευτή")) failures.push("Checkout must classify partner-only and mixed carts and explain the separate supplier shipment");
if (!client.includes("detailsReady") || !client.includes("mixedFulfilmentCart || !checkoutKey")) failures.push("Checkout must fail closed until fulfilment classification is hydrated and mixed local/dropship carts must not submit");
if (!client.includes("dropshipDeliveryChargeMinor(partnerSubtotalMinor)")) failures.push("Checkout summary must use the shared dropshipping delivery pricing rule");
if (!checkoutRoute.includes('payment: { provider: "mollie"') || !checkoutRoute.includes("requireMolliePayments().initiateOrderPayment")) failures.push("Checkout API must create Mollie payments and expose Mollie as the provider");
if (!dropshipPricing.includes("DROPSHIP_DELIVERY_FEE_MINOR = 750") || !dropshipPricing.includes("DROPSHIP_FREE_DELIVERY_THRESHOLD_MINOR = 4000")) failures.push("Dropshipping delivery must cost €7.50 below the €40.00 threshold");
if (!dropshipPricing.includes("subtotalMinor > 0 && subtotalMinor < DROPSHIP_FREE_DELIVERY_THRESHOLD_MINOR")) failures.push("Exactly €40.00 must qualify for free dropshipping delivery");
if (!dropshipCheckout.includes("const deliveryChargeMinor = dropshipDeliveryChargeMinor(subtotalMinor)")) failures.push("Dropshipping checkout must calculate delivery from the authoritative dropshipping subtotal");
if (!dropshipCheckout.includes("groupDeliveryChargeMinor") || !dropshipCheckout.includes("delivery_charge_minor")) failures.push("Dropshipping delivery charge must be persisted to one fulfilment group for order financial recalculation");
if (!dropshipCheckout.includes("discovery.rows.length !== requestedIds.length")) failures.push("Mixed local and dropshipping carts must continue to fail closed server-side");
if (dropshipCheckout.includes("!row.order_forwarding_enabled || !symphonyaRuntimeEnabled")) failures.push("Symphonya checkout must not depend on automatic supplier-order forwarding being enabled");
if (!dropshipCheckout.includes('supplierOrderForwarding: row.order_forwarding_enabled ? "automatic" : "manual"')) failures.push("Dropshipping order snapshots must record whether supplier forwarding is automatic or manual");
if (!mollieWebhook.includes("parseMollieWebhookBody") || !mollieWebhook.includes("reconcileMolliePaymentSafely")) failures.push("Mollie webhook must verify provider state through server-side retrieval/reconciliation");
if (!cart.includes("robots: { index: false, follow: false }")) failures.push("Cart must remain a noindex utility route");
if (!paymentSecurity.includes("Mollie")) failures.push("Payment security page must explain the active Mollie hosted checkout");
if (existsSync(`${root}/apps/web/src/app/api/payments/viva/webhook/route.ts`)) failures.push("Legacy Viva webhook route must not exist");
if (existsSync(`${root}/apps/web/src/lib/viva-runtime.ts`)) failures.push("Legacy Viva web runtime must not exist");
if (existsSync(`${root}/apps/web/src/app/checkout/success/page.tsx`) || existsSync(`${root}/apps/web/src/app/checkout/failure/page.tsx`)) failures.push("Legacy Viva-specific checkout return pages must not remain active");
if (!layout.includes('import "./checkout-polish.css"')) failures.push("Checkout polish stylesheet must be loaded after the shared site styles");

if (failures.length) {
  console.error("Checkout UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Checkout UX checks passed: Mollie-only provider gating, hydrated checkout idempotency, hosted redirect, authoritative dropshipping delivery pricing, mixed-cart protection, webhook reconciliation, utility noindex policy and legacy Viva route removal verified.");
