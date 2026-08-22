import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const resolver = read("apps/web/src/lib/customer-order-reference.ts");
const accountView = read("apps/web/src/lib/account-view.ts");
const accountBrowserView = read("apps/web/src/lib/customer-account-browser-view.ts");
const dashboard = read("apps/web/src/components/AccountDashboardClient.tsx");
const orders = read("apps/web/src/app/account/orders/page.tsx");
const detailPage = read("apps/web/src/app/account/orders/[id]/page.tsx");
const detailClient = read("apps/web/src/components/OrderDetailClient.tsx");
const paymentRoute = read("apps/web/src/app/api/account/orders/[id]/payment/route.ts");
const invoiceRoute = read("apps/web/src/app/api/account/orders/[id]/invoice/route.ts");
const cancelRoute = read("apps/web/src/app/api/account/orders/[id]/cancel/route.ts");
const returnsRoute = read("apps/web/src/app/api/account/orders/[id]/returns/route.ts");
const destinations = read("apps/web/src/lib/customer-notification-destination.ts");
const failures: string[] = [];

for (const contract of [
  "customerScope(principal.userId)",
  "JOIN users u ON u.id=co.user_id",
  "u.public_id=$1",
  "(co.order_number=$2 OR co.public_id=$2)",
  "marketplaceReferenceMap(\"order\"",
  "candidate.id === normalized || references.get(candidate.id) === normalized"
]) if (!resolver.includes(contract)) failures.push(`Order-reference resolver is missing ownership/backward-compatibility contract: ${contract}`);

for (const contract of [
  "const referenceNumber = orderReferences.get(order.id) ?? order.id",
  "id: referenceNumber",
  "requireCustomerOrderReference(principal, orderIdentifier)",
  "const orderId = resolved.internalId",
  "downloadUrl: `/api/account/orders/${encodeURIComponent(resolved.referenceNumber)}/invoice`",
  "state.notifications.map(customerBrowserNotification)",
  "payload: { orderReference: resolved.referenceNumber }"
]) if (!accountView.includes(contract)) failures.push(`Customer order projection still lacks public-reference contract: ${contract}`);
if (!accountBrowserView.includes('"orderReference"')) failures.push("Customer notification payload allowlist must retain public order references");
if (accountBrowserView.includes('"orderId"')) failures.push("Customer notification payload allowlist must not expose internal order ids");

if (accountView.includes("id: order.id,")) failures.push("Customer dashboard must not serialize the internal order id as its visible order identifier");
if (accountView.includes("downloadUrl: `/api/account/orders/${encodeURIComponent(orderId)}/invoice`")) failures.push("Invoice download URL must not expose the internal order id");

for (const source of [dashboard, orders]) {
  if (!source.includes("/account/orders/${order.id}")) failures.push("Customer order links no longer use the dashboard's public order identifier projection");
}

for (const contract of [
  "if (id !== detail.referenceNumber) redirect(`/account/orders/${encodeURIComponent(detail.referenceNumber)}`)",
  "accountOrderDetail(principal, id)"
]) if (!detailPage.includes(contract)) failures.push(`Legacy order URLs are not canonicalized safely: ${contract}`);

for (const contract of [
  "requireCustomerOrderReference(principal, id)",
  "orderId: resolved.internalId"
]) if (!paymentRoute.includes(contract)) failures.push(`Payment route does not resolve the public reference server-side: ${contract}`);

for (const contract of [
  "requireCustomerOrderReference(principal, id)",
  "customerFiscalDocumentForOrder(resolved.internalId)"
]) if (!invoiceRoute.includes(contract)) failures.push(`Invoice route does not resolve the public reference server-side: ${contract}`);

for (const source of [cancelRoute, returnsRoute]) {
  if (!source.includes("orderReference: result.referenceNumber")) failures.push("Customer transactional email payload must use the public order reference");
  if (!source.includes("/account/orders/${encodeURIComponent(result.referenceNumber)}")) failures.push("Customer transactional email CTA must use the public order reference");
  if (source.includes("ctaPath: `/account/orders/${encodeURIComponent(id)}`")) failures.push("Customer transactional email CTA still exposes the route's legacy/internal identifier");
}

for (const contract of [
  "payloadString(input.payload, \"orderReference\")",
  "if (orderReference) return orderDestination(orderReference, eventType)",
  "if (legacyOrderId)",
  "href: \"/account/orders\""
]) if (!destinations.includes(contract)) failures.push(`Notification navigation is missing public-reference/legacy fallback contract: ${contract}`);
if (destinations.includes("href: `/account/orders/${encodeURIComponent(orderId)}`")) failures.push("Notification navigation must never build a customer URL from legacy internal orderId");

for (const contract of [
  "encodeURIComponent(data.id)}/payment",
  "encodeURIComponent(data.id)}/cancel",
  "orderId={data.id}"
]) if (!detailClient.includes(contract)) failures.push(`Order detail action is no longer bound to the public projected identifier: ${contract}`);

if (failures.length) {
  console.error("Customer order public-reference checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer order public-reference checks passed: customer URLs/actions use the short reference, legacy IDs resolve only server-side under ownership, internal order ids are stripped from browser notification payloads, and old links canonicalize safely.");
