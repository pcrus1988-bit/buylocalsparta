import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const token = read("apps/web/src/lib/customer-private-offer-action-token.ts");
const askView = read("apps/web/src/lib/customer-ask-local-browser-view.ts");
const checkoutView = read("apps/web/src/lib/customer-private-offer-browser-view.ts");
const askPage = read("apps/web/src/app/account/ask-local/page.tsx");
const decisionRoute = read("apps/web/src/app/api/account/ask-local/offers/route.ts");
const clarificationRoute = read("apps/web/src/app/api/account/ask-local/clarifications/route.ts");
const checkoutPage = read("apps/web/src/app/checkout/private-offer/[id]/page.tsx");
const checkoutRoute = read("apps/web/src/app/api/account/ask-local/offers/[id]/checkout/route.ts");
const client = read("apps/web/src/components/PrivateOfferCheckoutClient.tsx");
const accountView = read("apps/web/src/lib/account-view.ts");
const failures: string[] = [];

for (const contract of [
  "createHmac(\"sha256\", accountAuthSecret())",
  "customer-private-offer:${userId}:${privateOfferId}",
  "timingSafeEqual",
  "JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id",
  "JOIN users u ON u.id=cr.customer_user_id",
  "WHERE u.public_id=$1",
  "privateOfferTokenMatches(principal.userId, internalId, candidate)"
]) if (!token.includes(contract)) failures.push(`Private-offer token resolver is missing ${contract}`);
if (token.includes("Buffer.from(candidate, \"base64")) failures.push("Private-offer token must not decode an embedded technical offer id");

for (const contract of [
  "customerPrivateOfferActionToken(principal.userId, offer.id)",
  "customerAskLocalRequests(principal)"
]) if (!askView.includes(contract)) failures.push(`Ask Local browser projection is missing ${contract}`);
if (!askPage.includes("customerAskLocalBrowserRequests(principal)")) failures.push("Ask Local page must project opaque offer tokens before client serialization");

for (const contract of [
  "requireCustomerPrivateOfferInternalId(principal, offerToken)",
  "customerDecideAskLocalOffer(principal, { offerId: resolved.internalId, action })",
  "customerAskLocalBrowserRequests(principal)"
]) if (!decisionRoute.includes(contract)) failures.push(`Offer decision route is missing token/ownership boundary: ${contract}`);
if (!decisionRoute.includes("requireAccountSession(request, true)")) failures.push("Offer decisions must remain CSRF protected");
if (!clarificationRoute.includes("customerAskLocalBrowserRequests(principal)")) failures.push("Clarification replies must not re-serialize technical offer ids");

for (const contract of [
  "requireCustomerPrivateOfferInternalId(principal, offerTokenOrLegacyId)",
  "cr.reference_number",
  "o.order_number",
  "offerId: resolved.actionToken",
  "requestId: requestReference",
  "existingOrderId: existingOrderReference"
]) if (!checkoutView.includes(contract)) failures.push(`Checkout browser projection is missing ${contract}`);

for (const contract of [
  "customerPrivateOfferBrowserPreview(principal, id)",
  "if (id !== offer.offerId) redirect",
  "/checkout/private-offer/${encodeURIComponent(offer.offerId)}"
]) if (!checkoutPage.includes(contract)) failures.push(`Private-offer checkout page is missing opaque-token canonicalization: ${contract}`);
if (checkoutPage.includes("customerPrivateOfferCheckoutPreview(principal, id)")) failures.push("Checkout page must not resolve a customer URL directly as a technical offer id");

for (const contract of [
  "requireCustomerPrivateOfferInternalId(principal, offerToken)",
  "offerId: resolvedOffer.internalId",
  "const orderReference = await publicOrderReference(result.order.id, principal.userId)",
  "payload: { orderReference }",
  "id: orderReference, orderId: orderReference",
  "requireVivaPayments().initiateOrderPayment({ orderId: result.order.id"
]) if (!checkoutRoute.includes(contract)) failures.push(`Private-offer checkout route is missing server/internal vs browser/public separation: ${contract}`);
if (checkoutRoute.includes("return Response.json({ ...result.order")) failures.push("Private-offer checkout must not serialize the raw CustomerOrder object");
if (checkoutRoute.includes("payload: { orderId:") || checkoutRoute.includes("privateOfferId: offerToken") || checkoutRoute.includes("privateOfferId: resolvedOffer")) failures.push("Customer checkout notification payload must not expose technical order/private-offer ids");

for (const contract of [
  "encodeURIComponent(offer.offerId)}/checkout",
  "href={`/account/orders/${encodeURIComponent(createdOrderId)}`}"
]) if (!client.includes(contract)) failures.push(`Private-offer checkout client is missing public token/reference action wiring: ${contract}`);
if (client.includes("poffer_")) failures.push("Private-offer checkout client must not embed poffer_ identifiers");

for (const contract of [
  "privateOfferId: _internalPrivateOfferId",
  "requestId: _internalAskLocalRequestId",
  "orderId: _internalOrderId",
  "returnId: _internalReturnId"
]) if (!accountView.includes(contract)) failures.push(`Customer notification sanitizer is missing ${contract}`);

if (failures.length) {
  console.error("Customer private-offer action-token checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer private-offer action-token checks passed: browser state uses customer-bound HMAC tokens, technical offer/order ids resolve only server-side under ownership, legacy URLs canonicalize, and checkout responses/notifications use public references only.");
