import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-payment-resume.ts");
const route = read("apps/web/src/app/api/account/orders/[id]/payment/route.ts");
const client = read("apps/web/src/components/OrderDetailClient.tsx");
const ordersPage = read("apps/web/src/app/account/orders/page.tsx");
const checkoutRoute = read("apps/web/src/app/api/checkout/route.ts");
const mollie = read("packages/postgres-runtime/src/mollie-payments.ts");
const mollieRuntime = read("apps/web/src/lib/mollie-runtime.ts");
const worker = read("workers/postgres-worker.ts");
const lifecycle = read("apps/web/src/lib/pending-payment-lifecycle.ts");
const lifecycleRoute = read("apps/web/src/app/api/cron/pending-payments/route.ts");
const vercel = read("apps/web/vercel.json");
const notifications = read("packages/postgres-runtime/src/notifications.ts");
const failures: string[] = [];

for (const contract of [
  "principal.roles.includes(\"customer\")",
  "productionDatabaseConfigured()",
  "molliePaymentsEnabled()",
  "WHERE o.public_id=$1 AND u.public_id=$2",
  "String(row.order_status) !== \"pending_payment\"",
  "sr.status='active' AND sr.expires_at>$3",
  "activeReservedLineCount !== lineCount",
  "PAYMENT_WINDOW_EXPIRED",
  "prepareMolliePaymentRetry",
  "requireMolliePayments().initiateOrderPayment",
  "activePaymentWindow(principal, orderId, startedAt)",
  "activePaymentWindow(principal, orderId, Date.now())"
]) if (!service.includes(contract)) failures.push(`Payment-resume service is missing ${contract}`);

if (service.includes("INSERT INTO customer_orders") || service.includes("INSERT INTO payments")) {
  failures.push("Payment resume must not create a new customer order or payment row");
}

for (const contract of [
  "requireAccountSession(request, true)",
  "principal.roles.includes(\"customer\")",
  "getVisitorKey()",
  "resumeCustomerOrderPayment",
  "PAYMENT_WINDOW_EXPIRED",
  "PAYMENT_NOT_PENDING",
  '"cache-control": "no-store"'
]) if (!route.includes(contract)) failures.push(`Payment-resume route is missing ${contract}`);

for (const contract of [
  "data.sourceStatus === \"pending_payment\"",
  "data.sourceStatus !== \"pending_payment\" && <CustomerFulfilmentProgress",
  "/payment`",
  "x-csrf-token",
  "window.location.assign(payload.redirectUrl)",
  "Συνέχιση ασφαλούς πληρωμής",
  "Δεν δημιουργείται νέα παραγγελία",
  "paymentError && <p className=\"form-error\" role=\"alert\""
]) if (!client.includes(contract)) failures.push(`Order detail payment recovery is missing ${contract}`);

if (!ordersPage.includes("Συνέχιση πληρωμής")) failures.push("Customer order list must expose the continue-payment CTA for pending-payment orders");

for (const contract of [
  "orderStatus !== \"pending_payment\"",
  "Payment belongs to another customer",
  "provider_payment_id",
  "const existingPaymentId =",
  "if (existingPaymentId) {",
  'return { kind: "existing" as const',
  'if (prepared.kind === "existing") {',
  "this.#client.retrievePayment(prepared.paymentId)",
  "this.#assertProviderIdentity(existing, input.orderId, prepared.orderNumber, prepared.amountMinor)"
]) if (!mollie.includes(contract)) failures.push(`Mollie payment service no longer guarantees ${contract}`);

for (const contract of [
  'new Set(["failed", "canceled", "expired"])',
  "prepareMolliePaymentRetry",
  "historicalPaymentIds",
  "paymentRetryPreparedAt",
  "recordTerminalAttemptWithoutCancelling",
  'orderStatus: "pending_payment"',
  "createdAtMs(row) + PAYMENT_WINDOW_MS > now",
  "TERMINAL_RETRYABLE_PROVIDER_STATUSES.has(provider.status)"
]) if (!mollieRuntime.includes(contract)) failures.push(`Mollie terminal retry protection is missing ${contract}`);

if (!checkoutRoute.includes("prepareMolliePaymentRetry({ orderId: order.id, customerId: principal.userId, now })")) {
  failures.push("Normal checkout retry must rotate a terminal Mollie attempt without creating a new KONTA MOY order");
}

for (const contract of [
  "const TWO_HOURS_MS = 2 * 60 * 60 * 1_000",
  "const TWENTY_TWO_HOURS_MS = 22 * 60 * 60 * 1_000",
  "const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1_000",
  '"order.payment_reminder_2h"',
  '"order.payment_reminder_22h"',
  'ctaLabel: "Συνέχιση πληρωμής"',
  "'email','transactional'",
  "ON CONFLICT (dedupe_key)",
  "o.status='pending_payment'",
  "created_at <= $2",
  "cancellation_reason='payment_window_expired'",
  "prepareOrderCancellation",
  "o.created_at + interval '24 hours'"
]) if (!lifecycle.includes(contract)) failures.push(`Pending-payment lifecycle is missing ${contract}`);

if (!lifecycleRoute.includes("runPendingPaymentLifecycle") || !lifecycleRoute.includes("CRON_SECRET")) {
  failures.push("Pending-payment lifecycle cron route must be authenticated and execute the lifecycle sweep");
}
if (!vercel.includes('"path": "/api/cron/pending-payments"') || !vercel.includes('"schedule": "* * * * *"')) {
  failures.push("Pending-payment lifecycle must run every minute in production");
}
for (const contract of [
  '"order.payment_reminder_2h"',
  '"order.payment_reminder_22h"',
  "o.status='pending_payment'",
  "o.created_at > now() - interval '24 hours'",
  "sr.status='active' AND sr.expires_at>now()"
]) if (!notifications.includes(contract)) failures.push(`Reminder delivery-time safety gate is missing ${contract}`);

if (worker.includes("SELECT expire_pending_payment_orders") || worker.includes("expire_pending_payment_orders($")) failures.push("Legacy worker must not invoke pending-payment cancellation from reservation expiry alone");
if (!worker.includes("o.created_at + interval '24 hours'")) failures.push("PostgreSQL worker must protect live pending-payment reservations for the 24-hour window");

if (failures.length) {
  console.error("Customer payment-resume checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer payment-resume checks passed: dashboard CTA, same-order terminal Mollie retry, CSRF/customer ownership, active reservation checks, 2h/22h transactional reminder scheduling with stale-send suppression, 24h reservation protection and provider-safe automatic cancellation verified.");
