import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const dashboard = read("apps/web/src/components/AccountDashboardClient.tsx");
const orders = read("apps/web/src/app/account/orders/page.tsx");
const primitives = read("apps/web/src/components/CustomerAccountPrimitives.tsx");
const detail = read("apps/web/src/components/OrderDetailClient.tsx");
const commerceRuntime = read("apps/web/src/lib/customer-commerce-runtime.ts");
const postgresCommerce = read("packages/postgres-runtime/src/customer-commerce.ts");
const failures: string[] = [];

for (const contract of [
  "αναμονή πληρωμής|χρειάζεται ενέργεια",
  "orderAttentionBody",
  "Η παραγγελία έχει δημιουργηθεί, αλλά χρειάζεται να ολοκληρώσεις την ασφαλή πληρωμή",
  "orderAttentionAction",
  "Συνέχιση πληρωμής",
  "attentionOrders.length"
]) if (!dashboard.includes(contract)) failures.push(`Account dashboard is missing pending-payment actionability contract: ${contract}`);

for (const contract of [
  "orderActionLabel",
  "status.includes(\"Αναμονή πληρωμής\") ? \"Συνέχιση πληρωμής\"",
  "orderActionClass",
  "/Αναμονή πληρωμής|Έτοιμη για παραλαβή/",
  "className={orderActionClass(order.status)}"
]) if (!orders.includes(contract)) failures.push(`Order directory is missing pending-payment actionability contract: ${contract}`);

for (const contract of [
  "const paymentAction = normalized.includes(\"αναμονή πληρωμής\")",
  "paymentAction && index === 0",
  "state: \"action\" as const"
]) if (!primitives.includes(contract)) failures.push(`Order lifecycle no longer marks pending payment as customer action: ${contract}`);

for (const contract of [
  "data.sourceStatus === \"pending_payment\"",
  "Συνέχιση ασφαλούς πληρωμής",
  "/payment`",
  "x-csrf-token"
]) if (!detail.includes(contract)) failures.push(`Order detail no longer provides governed payment recovery: ${contract}`);

const pendingCancellationMatch = commerceRuntime.match(/if \(order\.status === "pending_payment"\) \{([\s\S]*?)\n\s*return cancelled;\n\s*\}/);
if (!pendingCancellationMatch) {
  failures.push("Customer commerce runtime is missing the dedicated pending-payment cancellation path");
} else {
  const pendingCancellation = pendingCancellationMatch[1];
  const localCancellation = pendingCancellation.indexOf("runtime.customerCommerce.cancelCustomerOrder");
  const vivaPreparation = pendingCancellation.indexOf("runtime.vivaPayments.prepareOrderCancellation");
  if (localCancellation < 0) failures.push("Pending-payment cancellation no longer cancels the order locally");
  if (vivaPreparation < 0) failures.push("Pending-payment cancellation no longer performs the post-cancel payment race check");
  if (localCancellation >= 0 && vivaPreparation >= 0 && localCancellation > vivaPreparation) {
    failures.push("Pending-payment cancellation must complete its local cancellation before any Viva cancellation preparation");
  }
}

if (!postgresCommerce.includes("status IN ('created','requires_action','authorised','failed') THEN 'cancelled'")) {
  failures.push("Postgres customer cancellation no longer marks uncharged payment states as cancelled before the post-cancel Viva check");
}

if (failures.length) {
  console.error("Customer order actionability checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer order actionability checks passed: pending payment is prioritized on the dashboard, explicit in the order directory, orange in lifecycle semantics, recoverable from order detail, and customer cancellation closes an unpaid order locally before any Viva cancellation preparation.");
