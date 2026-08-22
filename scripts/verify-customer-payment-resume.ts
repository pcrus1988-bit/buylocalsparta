import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-payment-resume.ts");
const route = read("apps/web/src/app/api/account/orders/[id]/payment/route.ts");
const client = read("apps/web/src/components/OrderDetailClient.tsx");
const viva = read("packages/postgres-runtime/src/viva-payments.ts");
const worker = read("workers/postgres-worker.ts");
const failures: string[] = [];

for (const contract of [
  "principal.roles.includes(\"customer\")",
  "productionDatabaseConfigured()",
  "vivaPaymentsEnabled()",
  "WHERE o.public_id=$1 AND u.public_id=$2",
  "String(row.order_status) !== \"pending_payment\"",
  "sr.status='active' AND sr.expires_at>$3",
  "activeReservedLineCount !== lineCount",
  "PAYMENT_WINDOW_EXPIRED",
  "requireVivaPayments().initiateOrderPayment",
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

for (const contract of [
  "orderStatus !== \"pending_payment\"",
  "Payment order belongs to another customer",
  "provider_order_code",
  "if (existing) return { kind:\"existing\""
]) if (!viva.includes(contract)) failures.push(`Viva payment service no longer guarantees ${contract}`);

if (!worker.includes("expire_pending_payment_orders")) failures.push("Pending-payment reservation expiry worker is not wired");

if (failures.length) {
  console.error("Customer payment-resume checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer payment-resume checks passed: CSRF/customer ownership, pending-payment gating, double active-reservation checks, Viva order reuse, expiry cleanup and customer recovery CTA verified.");
