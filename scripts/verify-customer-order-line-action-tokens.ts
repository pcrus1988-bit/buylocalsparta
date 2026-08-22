import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const token = read("apps/web/src/lib/customer-order-line-action-token.ts");
const accountView = read("apps/web/src/lib/account-view.ts");
const returnsRoute = read("apps/web/src/app/api/account/orders/[id]/returns/route.ts");
const returnsPanel = read("apps/web/src/components/CustomerReturnsPanel.tsx");
const fulfilmentProgress = read("apps/web/src/components/CustomerFulfilmentProgress.tsx");
const failures: string[] = [];

for (const contract of [
  'createHmac("sha256", accountAuthSecret())',
  "customer-order-line:${userId}:${orderId}:${orderLineId}",
  "timingSafeEqual",
  "const order = await customerOrder(principal, orderId)",
  "customerOrderLineActionToken(principal.userId, order.id, line.id)",
  "line.id === candidate || safeEqual(token, candidate)"
]) if (!token.includes(contract)) failures.push(`Order-line token resolver is missing ${contract}`);
if (token.includes("Buffer.from(candidate, \"base64")) failures.push("Order-line token must not encode/decode a technical line id");

for (const contract of [
  "id: customerOrderLineActionToken(principal.userId, order.id, line.id)",
  "const line = await requireCustomerOrderLineInternalId(principal, resolved.internalId, input.orderLineId)",
  "orderLineId: line.internalId",
  "const lineTokens = new Map(order.lines.map",
  "id: lineTokens.get(line.id)!",
  "orderLineId: token",
  "lineIds: fulfilment.lineIds.flatMap",
  "lineTokens.get(lineId)",
  "id: `part-${index + 1}`"
]) if (!accountView.includes(contract)) failures.push(`Customer order projection is missing line-token separation: ${contract}`);
if (accountView.includes("id: line.id,")) failures.push("Customer order projections must not serialize technical order-line ids");
if (accountView.includes("id: fulfilment.id")) failures.push("Customer fulfilment cards must not serialize technical fulfilment ids");
if (accountView.includes("returns: returns.cases")) failures.push("Customer return history must translate stored order-line ids before browser serialization");

for (const contract of [
  "requireAccountSession(request, true)",
  "orderLineId",
  "requestCustomerReturn(principal"
]) if (!returnsRoute.includes(contract)) failures.push(`Return route is missing ${contract}`);
if (!returnsPanel.includes("orderLineId: line.id")) failures.push("Return UI must submit the browser-safe line token as its action locator");
if (!returnsPanel.includes("lines.find((line) => line.id === entry.orderLineId)")) failures.push("Return history must join product titles through the browser-safe line token");
if (!fulfilmentProgress.includes("part.lineIds.flatMap") || !fulfilmentProgress.includes("entry.id === id")) failures.push("Fulfilment UI must join products through the browser-safe line token");

if (failures.length) {
  console.error("Customer order-line action-token checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer order-line action-token checks passed: technical line/fulfilment ids remain server-side, customer/order-bound HMAC tokens drive return and fulfilment joins, legacy line ids resolve only through owned orders, and return mutations remain CSRF protected.");
