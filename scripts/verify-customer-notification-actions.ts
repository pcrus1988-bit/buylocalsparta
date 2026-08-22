import { readFileSync } from "node:fs";
import { customerNotificationDestination } from "../apps/web/src/lib/customer-notification-destination.ts";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const resolver = read("apps/web/src/lib/customer-notification-destination.ts");
const client = read("apps/web/src/components/AccountNotificationsClient.tsx");
const stateRuntime = read("apps/web/src/lib/customer-state-runtime.ts");
const notificationTypes = read("packages/core/src/notifications/types.ts");
const failures: string[] = [];

function expectDestination(name: string, input: Parameters<typeof customerNotificationDestination>[0], expected: { href: string; label?: string; priority?: string } | undefined) {
  const actual = customerNotificationDestination(input);
  if (!expected) {
    if (actual) failures.push(`${name}: expected no destination, got ${actual.href}`);
    return;
  }
  if (!actual) {
    failures.push(`${name}: expected ${expected.href}, got no destination`);
    return;
  }
  if (actual.href !== expected.href) failures.push(`${name}: expected href ${expected.href}, got ${actual.href}`);
  if (expected.label && actual.label !== expected.label) failures.push(`${name}: expected label ${expected.label}, got ${actual.label}`);
  if (expected.priority && actual.priority !== expected.priority) failures.push(`${name}: expected priority ${expected.priority}, got ${actual.priority}`);
}

expectDestination("exact public order", { eventType: "order.ready", group: "orders", payload: { orderReference: "BLS-20260822-ABC123" } }, { href: "/account/orders/BLS-20260822-ABC123", label: "Άνοιγμα παραγγελίας" });
expectDestination("encoded public order", { eventType: "pickup.ready", group: "delivery", payload: { orderReference: "BLS/A B" } }, { href: "/account/orders/BLS%2FA%20B" });
expectDestination("payment action", { eventType: "payment.requires_action", group: "orders", payload: { orderReference: "BLS-20260822-PAY456" } }, { href: "/account/orders/BLS-20260822-PAY456", label: "Συνέχιση πληρωμής", priority: "primary" });
expectDestination("return order", { eventType: "return.requested", group: "returns", payload: { orderReference: "BLS-20260822-RET001" } }, { href: "/account/orders/BLS-20260822-RET001" });
expectDestination("legacy order id", { eventType: "order.ready", group: "orders", payload: { orderId: "order_123" } }, { href: "/account/orders", label: "Άνοιγμα παραγγελιών", priority: "secondary" });
expectDestination("legacy payment id", { eventType: "payment.requires_action", group: "orders", payload: { orderId: "order_456" } }, { href: "/account/orders", label: "Δες παραγγελίες", priority: "secondary" });
expectDestination("Ask Local", { eventType: "counteroffer.needs_info", group: "advice", payload: { requestId: "cor_1" } }, { href: "/account/ask-local" });
expectDestination("Ask Local direct prefix", { eventType: "ask_local.offer_received", group: "other", payload: { requestId: "cor_2" } }, { href: "/account/ask-local" });
expectDestination("support", { eventType: "customer_support.reply", group: "other", payload: { caseReference: "TKT-100" } }, { href: "/account/support" });
expectDestination("saved product", { eventType: "saved_product.price_drop", group: "saved", payload: { canonicalVariantId: "variant/1" } }, { href: "/product/variant%2F1" });
expectDestination("saved fallback", { eventType: "saved_search.new_match", group: "saved", payload: {} }, { href: "/account/saved" });
expectDestination("privacy", { eventType: "privacy.export_ready", group: "account", payload: {} }, { href: "/account/privacy" });
expectDestination("security", { eventType: "account.password_changed", group: "other", payload: {} }, { href: "/account/security" });
expectDestination("order group fallback", { eventType: "legacy.event", group: "orders", payload: {} }, { href: "/account/orders" });
expectDestination("no context", { eventType: "misc.notice", group: "other", payload: {} }, undefined);
expectDestination("malicious URL ignored", { eventType: "misc.notice", group: "other", payload: { url: "https://evil.example", href: "//evil.example", redirect: "javascript:alert(1)", sourceUrl: "https://evil.example" } }, undefined);
expectDestination("malicious URL cannot override public order", { eventType: "order.ready", group: "orders", payload: { orderReference: "BLS-SAFE-001", url: "https://evil.example" } }, { href: "/account/orders/BLS-SAFE-001" });

for (const forbidden of ["item.title", "item.body", "input.title", "input.body", "payload.url", "payload.href", "payload.redirect", "payload.sourceUrl"]) {
  if (resolver.includes(forbidden)) failures.push(`Resolver must not depend on notification prose or payload navigation field: ${forbidden}`);
}
for (const contract of [
  "eventType: string",
  "payload: Record<string, unknown>",
  "encodeURIComponent(orderReference)",
  "payloadString(input.payload, \"orderReference\")",
  "payloadString(input.payload, \"orderId\")",
  "encodeURIComponent(canonicalVariantId)",
  "customerNotificationDestination"
]) if (!resolver.includes(contract)) failures.push(`Structured notification resolver is missing contract: ${contract}`);
if (resolver.includes("encodeURIComponent(orderId)")) failures.push("Legacy internal orderId must never be converted into a customer-facing deep link.");

for (const contract of [
  "eventType: string",
  "payload: Record<string, unknown>",
  "customerNotificationDestination({ eventType: item.eventType, group: item.group, payload: item.payload })",
  "x-csrf-token",
  "Όλα ως αναγνωσμένα"
]) if (!client.includes(contract)) failures.push(`Notification center is missing structured-action/read-state contract: ${contract}`);

if (client.includes("`${item.title} ${item.body} ${item.group}`") || client.includes("text.includes(\"ask local\")")) {
  failures.push("Notification center must not infer destinations from human-facing title/body copy.");
}

for (const contract of [
  "notifications: readonly (Notification & { group: string })[]",
  "notificationOperations.centerForUser"
]) if (!stateRuntime.includes(contract)) failures.push(`Customer state must preserve full structured Notification fields: ${contract}`);
for (const contract of ["eventType: string", "payload: Record<string, unknown>"]) if (!notificationTypes.includes(contract)) failures.push(`Core Notification model is missing structured navigation field: ${contract}`);

if (failures.length) {
  console.error("Customer notification action checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer notification action checks passed: actions use structured event context, public order references for customer deep links, safe legacy fallbacks, CSRF read controls, and ignore arbitrary payload URLs and human-facing copy.");
