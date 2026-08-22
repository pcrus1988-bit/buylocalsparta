import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const mapper = read("apps/web/src/lib/customer-ask-local-view.ts");
const resolver = read("apps/web/src/lib/customer-private-offer-reference.ts");
const askLocalClient = read("apps/web/src/components/AskLocalClient.tsx");
const publicAskLocalPage = read("apps/web/src/app/ask-local/page.tsx");
const accountAskLocalPage = read("apps/web/src/app/account/ask-local/page.tsx");
const askLocalRoute = read("apps/web/src/app/api/account/ask-local/route.ts");
const offerRoute = read("apps/web/src/app/api/account/ask-local/offers/route.ts");
const clarificationRoute = read("apps/web/src/app/api/account/ask-local/clarifications/route.ts");
const checkoutView = read("apps/web/src/lib/customer-private-offer-checkout-view.ts");
const checkoutPage = read("apps/web/src/app/checkout/private-offer/[id]/page.tsx");
const checkoutClient = read("apps/web/src/components/PrivateOfferCheckoutClient.tsx");
const checkoutRoute = read("apps/web/src/app/api/account/ask-local/offers/[id]/checkout/route.ts");
const accountView = read("apps/web/src/lib/account-view.ts");
const internalOfferService = read("apps/web/src/lib/ask-local-offer-service.ts");
const internalCheckoutService = read("apps/web/src/lib/private-offer-checkout-service.ts");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  'Omit<InternalPrivateOffer, "id">',
  "id: _internalOfferId",
  "actionReference: request.referenceNumber"
]) expect(mapper.includes(contract), `Customer Ask Local browser mapper is missing ${contract}`);

for (const [name, source] of [["public Ask Local", publicAskLocalPage], ["account Ask Local", accountAskLocalPage]] as const) {
  expect(source.includes("customerAskLocalRequestViews(await customerAskLocalRequests(principal))"), `${name} page must sanitize raw Ask Local requests before rendering customer state`);
}
for (const source of [askLocalRoute, offerRoute, clarificationRoute]) {
  expect(source.includes("customerAskLocalRequestView") || source.includes("customerAskLocalRequestViews"), "Every customer Ask Local API response carrying requests must use the browser-safe mapper");
}

for (const contract of [
  "u.public_id=$2",
  "po.public_id=$1 OR (cr.reference_number=$1",
  'purpose === "decision"',
  'purpose: CustomerPrivateOfferPurpose',
  "result.rowCount !== 1",
  "offerId, requestReference"
]) expect(resolver.includes(contract), `Customer private-offer resolver is missing ${contract}`);

for (const contract of [
  "requestReference, action",
  "resolveCustomerPrivateOfferReference(principal, requestReference, \"decision\")",
  "offerId: resolved.offerId"
]) expect(offerRoute.includes(contract), `Customer private-offer decision route is missing ${contract}`);

for (const contract of [
  "CustomerAskLocalRequestView",
  "actionReference = offer.actionReference",
  'decideOffer(actionReference, "accept")',
  'decideOffer(actionReference, "decline")',
  "encodeURIComponent(actionReference)"
]) expect(askLocalClient.includes(contract), `Customer Ask Local UI is missing private-offer reference contract: ${contract}`);
for (const forbidden of ["offer.id", "privateOfferId", "poffer_"]) {
  expect(!askLocalClient.includes(forbidden), `Customer Ask Local UI must not expose technical private-offer identifier: ${forbidden}`);
}

for (const contract of [
  'Omit<CustomerPrivateOfferCheckoutPreview, "offerId" | "requestId" | "existingOrderId">',
  "resolveCustomerPrivateOfferReference(principal, identifier, \"checkout\")",
  "actionReference: resolved.requestReference",
  "requestReference: resolved.requestReference",
  'marketplaceReference("order", preview.existingOrderId)'
]) expect(checkoutView.includes(contract), `Customer checkout projection is missing ${contract}`);

for (const contract of [
  "customerPrivateOfferCheckoutView(principal, id)",
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
  "resolveCustomerPrivateOfferReference(principal, offerReference, \"checkout\")",
  "offerId: resolved.offerId",
  'marketplaceReference("order", result.order.id)',
  "id: orderReference",
  "referenceNumber: orderReference",
  "payload: { orderReference, requestReference: resolved.requestReference }"
]) expect(checkoutRoute.includes(contract), `Customer checkout API is missing server/internal to public/reference boundary: ${contract}`);
expect(!checkoutRoute.includes("payload: { orderId:"), "Customer checkout notification must not contain internal orderId");
expect(!checkoutRoute.includes("privateOfferId:"), "Customer checkout notification must not contain privateOfferId");

expect(accountView.includes("privateOfferId: _internalPrivateOfferId"), "Customer notification projection must strip historical privateOfferId payload fields");

// Technical IDs remain legitimate only inside server-side offer/provenance services.
expect(internalOfferService.includes("po.public_id=$1") && internalOfferService.includes("u.public_id=$2"), "Internal offer decision service must retain exact offer ownership enforcement");
expect(internalCheckoutService.includes("source_reference") && internalCheckoutService.includes("WHERE po.public_id=$1 AND u.public_id=$2"), "Internal checkout service must retain exact offer provenance and ownership checks");

if (failures.length) {
  console.error("Customer private-offer reference checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer private-offer reference checks passed: both Ask Local pages, customer APIs, decisions and checkout use ASK/order references only; legacy poffer IDs resolve server-side under ownership; exact private-offer IDs remain confined to internal provenance services.");
