import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const askBrowserView = read("apps/web/src/lib/customer-ask-local-browser-view.ts");
const tokenResolver = read("apps/web/src/lib/customer-private-offer-action-token.ts");
const askLocalClient = read("apps/web/src/components/AskLocalClient.tsx");
const publicAskLocalPage = read("apps/web/src/app/ask-local/page.tsx");
const accountAskLocalPage = read("apps/web/src/app/account/ask-local/page.tsx");
const askLocalRoute = read("apps/web/src/app/api/account/ask-local/route.ts");
const offerRoute = read("apps/web/src/app/api/account/ask-local/offers/route.ts");
const clarificationRoute = read("apps/web/src/app/api/account/ask-local/clarifications/route.ts");
const checkoutView = read("apps/web/src/lib/customer-private-offer-browser-view.ts");
const checkoutPage = read("apps/web/src/app/checkout/private-offer/[id]/page.tsx");
const checkoutClient = read("apps/web/src/components/PrivateOfferCheckoutClient.tsx");
const checkoutRoute = read("apps/web/src/app/api/account/ask-local/offers/[id]/checkout/route.ts");
const accountView = read("apps/web/src/lib/account-view.ts");
const accountBrowserView = read("apps/web/src/lib/customer-account-browser-view.ts");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "CustomerAskLocalRequestView",
  "id, ...offer",
  "actionReference: customerPrivateOfferActionToken(principal.userId, id)"
]) expect(askBrowserView.includes(contract), `Customer Ask Local browser projection is missing ${contract}`);

for (const [name, source] of [["public Ask Local", publicAskLocalPage], ["account Ask Local", accountAskLocalPage]] as const) {
  expect(source.includes("customerAskLocalBrowserRequests(principal)"), `${name} page must project opaque action tokens before rendering customer state`);
}
for (const source of [askLocalRoute, offerRoute, clarificationRoute]) {
  expect(source.includes("customerAskLocalBrowserRequest"), "Every customer Ask Local API response carrying requests must use the browser-safe projection");
}

for (const contract of [
  'createHmac("sha256", accountAuthSecret())',
  "timingSafeEqual",
  "WHERE u.public_id=$1",
  "privateOfferTokenMatches(principal.userId, internalId, candidate)"
]) expect(tokenResolver.includes(contract), `Customer-bound private-offer token resolver is missing ${contract}`);

for (const contract of [
  "body.actionReference",
  "requireCustomerPrivateOfferInternalId(principal, offerToken)",
  "offerId: resolved.internalId"
]) expect(offerRoute.includes(contract), `Customer private-offer decision route is missing ${contract}`);

for (const contract of [
  "CustomerAskLocalRequestView",
  "actionReference = offer.actionReference",
  'decideOffer(actionReference, "accept")',
  'decideOffer(actionReference, "decline")',
  "encodeURIComponent(actionReference)"
]) expect(askLocalClient.includes(contract), `Customer Ask Local UI is missing opaque action-reference contract: ${contract}`);
for (const forbidden of ["offer.id", "privateOfferId", "poffer_"]) {
  expect(!askLocalClient.includes(forbidden), `Customer Ask Local UI must not expose technical private-offer identifier: ${forbidden}`);
}

for (const contract of [
  "requireCustomerPrivateOfferInternalId(principal, offerTokenOrLegacyId)",
  'offerId: _internalOfferId',
  "actionReference: resolved.actionToken",
  "requestReference",
  "existingOrderReference"
]) expect(checkoutView.includes(contract), `Customer checkout projection is missing ${contract}`);

for (const contract of [
  "customerPrivateOfferBrowserPreview(principal, id)",
  "id !== offer.actionReference",
  "offer.requestReference",
  "offer.existingOrderReference"
]) expect(checkoutPage.includes(contract), `Customer private-offer page is missing canonical public-reference contract: ${contract}`);

for (const forbidden of ["offer.offerId", "offer.requestId", "offer.existingOrderId", "poffer_"]) {
  expect(!checkoutClient.includes(forbidden), `Customer checkout client must not expose technical identifier: ${forbidden}`);
}
for (const contract of ["offer.actionReference", "offer.requestReference", "createdOrderReference"]) {
  expect(checkoutClient.includes(contract), `Customer checkout client is missing ${contract}`);
}

for (const contract of [
  "requireCustomerPrivateOfferInternalId(principal, offerToken)",
  "offerId: resolvedOffer.internalId",
  "publicOrderReference(result.order.id, principal.userId)",
  "id: orderReference, orderId: orderReference",
  "payload: { orderReference }"
]) expect(checkoutRoute.includes(contract), `Customer checkout API is missing server/internal to public/reference boundary: ${contract}`);
expect(!checkoutRoute.includes("payload: { orderId:"), "Customer checkout notification must not contain internal orderId");
expect(!checkoutRoute.includes("privateOfferId:"), "Customer checkout notification must not contain privateOfferId");

expect(accountView.includes("state.notifications.map(customerBrowserNotification)"), "Customer account state must use the strict browser notification projection");
for (const forbidden of ["privateOfferId", "requestId", "orderId", "returnId"]) {
  expect(!accountBrowserView.includes(`"${forbidden}"`), `Customer notification payload allowlist must not expose ${forbidden}`);
}

if (failures.length) {
  console.error("Customer private-offer reference checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer private-offer reference checks passed: customer-bound opaque tokens drive offer actions, public ASK/order references drive customer display, and technical identifiers remain server-side under ownership checks.");
