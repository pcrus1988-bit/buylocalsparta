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

if (!page.includes("molliePaymentsProviderReadiness()") || !page.includes("mollie.enabled && mollie.ready")) failures.push("Checkout page must derive production payment availability from Mollie provider readiness, not optimistic UI copy");
if (!page.includes('paymentMode !== "unavailable"')) failures.push("Checkout page must expose an explicit unavailable payment state");
if (!page.includes('robots: { index: false, follow: false }')) failures.push("Checkout must remain a noindex utility route");
if (!page.includes('process.env.BLS_BOXNOW_ENABLED === "true"') || !page.includes('process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED === "true"')) failures.push("Checkout page must require both BOX NOW backend and widget enablement before offering locker shipping");
if (!client.includes("checkout-availability-gate") || !client.includes("if (!checkoutEnabled)")) failures.push("Checkout client must fail closed with a clear availability gate");
if (!client.includes("if (boxNowEnabled) fulfilmentOptions.push")) failures.push("Checkout fulfilment choices must omit BOX NOW when the provider is disabled");
if (!client.includes('paymentMode === "mollie"')) failures.push("Checkout payment copy must reflect the actual Mollie payment mode");
if (!client.includes('body.payment?.provider === "mollie"') || !client.includes("window.location.assign(body.payment.redirectUrl)")) failures.push("Checkout client must follow only the Mollie hosted-payment redirect");
if (!client.includes("if (!checkoutEnabled || !hydrated")) failures.push("Disabled checkout must not create an idempotency key as if a transaction could proceed");
if (!checkoutRoute.includes('payment: { provider: "mollie"') || !checkoutRoute.includes("requireMolliePayments().initiateOrderPayment")) failures.push("Checkout API must create Mollie payments and expose Mollie as the provider");
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
console.log("Checkout UX checks passed: Mollie-only provider gating, hosted redirect, webhook reconciliation, utility noindex policy and legacy Viva route removal verified.");
