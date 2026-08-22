import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-returns-service.ts");
const accountView = read("apps/web/src/lib/account-view.ts");
const accountBrowserView = read("apps/web/src/lib/customer-account-browser-view.ts");
const route = read("apps/web/src/app/api/account/orders/[id]/returns/route.ts");
const panel = read("apps/web/src/components/CustomerReturnsPanel.tsx");
const failures: string[] = [];

const customerReturnType = service.match(/export type CustomerReturnCase = Readonly<\{([\s\S]*?)\}>;/)?.[1] ?? "";
if (!customerReturnType) failures.push("CustomerReturnCase projection could not be inspected");
if (/\borderId\s*:/.test(customerReturnType)) failures.push("Customer-visible return cases must not serialize the internal order identifier");

for (const contract of [
  'const internalId = text(row.public_id, "return.public_id")',
  'const referenceNumber = text(row.return_number, "return.return_number")',
  "id: referenceNumber",
  "returnNumber: referenceNumber",
  "cases.set(internalId, entry)"
]) if (!service.includes(contract)) failures.push(`Return projection is missing internal-key/public-reference separation: ${contract}`);

if (service.includes("id: id,") || service.includes("orderId,\n            status:")) {
  failures.push("Return case projection still exposes a technical return/order identifier");
}

for (const contract of [
  "state.notifications.map(customerBrowserNotification)",
  "payload: { orderReference: resolved.referenceNumber, returnNumber: created.returnNumber, returnReference: created.returnNumber }",
  "dedupeKey: `return:${created.returnId}:requested`"
]) if (!accountView.includes(contract)) failures.push(`Account return handling is missing browser/server identifier separation: ${contract}`);
if (!accountBrowserView.includes('"returnNumber"') || !accountBrowserView.includes('"returnReference"')) failures.push("Customer notification payload allowlist must retain public return references");
if (accountBrowserView.includes('"returnId"')) failures.push("Customer notification payload allowlist must not expose internal return ids");
if (accountView.includes("payload: { orderReference: resolved.referenceNumber, returnId:")) failures.push("Customer in-app return notification payload must not expose returnId");

for (const contract of [
  "const reference = latestReturn?.returnNumber ?? result.referenceNumber",
  "idempotencyKey: `customer-return-requested:${reference}:${orderLineId}`",
  "returnReference: reference",
  "ctaPath: `/account/orders/${encodeURIComponent(result.referenceNumber)}`"
]) if (!route.includes(contract)) failures.push(`Customer return email flow is missing public-reference contract: ${contract}`);
if (route.includes("returnId:")) failures.push("Customer return transactional email payload must not contain a technical returnId");

for (const contract of [
  "key={item.id}",
  "<strong>{item.returnNumber}</strong>",
  "context=return&id=${encodeURIComponent(item.returnNumber)}"
]) if (!panel.includes(contract)) failures.push(`Return UI is missing public-reference usage: ${contract}`);
if (panel.includes("ret_")) failures.push("Return UI must not embed technical ret_ identifiers");

if (failures.length) {
  console.error("Customer return public-reference checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer return public-reference checks passed: return cases project RET references, internal return/order ids remain server-only, and customer notification/email/support paths use human references.");
