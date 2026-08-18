import { readFileSync } from "node:fs";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const failures: string[] = [];

const page = read("apps/web/src/app/checkout/page.tsx");
const client = read("apps/web/src/components/CheckoutPageClient.tsx");
const cart = read("apps/web/src/app/cart/page.tsx");
const success = read("apps/web/src/app/checkout/success/page.tsx");
const failure = read("apps/web/src/app/checkout/failure/page.tsx");
const layout = read("apps/web/src/app/layout.tsx");

if (!page.includes("vivaPaymentsReady()")) failures.push("Checkout page must derive production payment availability from Viva readiness, not optimistic UI copy");
if (!page.includes('paymentMode !== "unavailable"')) failures.push("Checkout page must expose an explicit unavailable payment state");
if (!page.includes('process.env.BLS_BOXNOW_ENABLED === "true"') || !page.includes('process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED === "true"')) failures.push("Checkout page must require both BOX NOW backend and widget enablement before offering locker shipping");
if (!client.includes("checkout-availability-gate") || !client.includes("if (!checkoutEnabled)")) failures.push("Checkout client must fail closed with a clear availability gate");
if (!client.includes("if (boxNowEnabled) fulfilmentOptions.push")) failures.push("Checkout fulfilment choices must omit BOX NOW when the provider is disabled");
if (!client.includes('paymentMode === "viva"')) failures.push("Checkout payment copy must reflect the actual payment mode");
if (!client.includes("if (!checkoutEnabled || !hydrated")) failures.push("Disabled checkout must not create an idempotency key as if a transaction could proceed");
if (!cart.includes("robots: { index: false, follow: false }")) failures.push("Cart must remain a noindex utility route");
for (const [name, source] of [["success", success], ["failure", failure]] as const) {
  if (!source.includes("robots: { index: false, follow: false }")) failures.push(`Checkout ${name} page must be noindex`);
  if (!source.includes("<SiteHeader compact") || !source.includes("<SiteFooter />")) failures.push(`Checkout ${name} page must use the shared customer shell`);
}
if (!layout.includes('import "./checkout-polish.css"')) failures.push("Checkout polish stylesheet must be loaded after the shared site styles");

if (failures.length) {
  console.error("Checkout UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Checkout UX checks passed: payment/shipping capability gating, utility noindex policy and shared result-page navigation verified.");
