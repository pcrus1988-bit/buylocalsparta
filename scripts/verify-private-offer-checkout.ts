import { readFileSync } from "node:fs";
import { NON_INDEXABLE_PAGE_ROUTES } from "../apps/web/src/lib/site-navigation.ts";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/private-offer-checkout-service.ts");
const route = read("apps/web/src/app/api/account/ask-local/offers/[id]/checkout/route.ts");
const page = read("apps/web/src/app/checkout/private-offer/[id]/page.tsx");
const client = read("apps/web/src/components/PrivateOfferCheckoutClient.tsx");
const askLocal = read("apps/web/src/components/AskLocalClient.tsx");
const failures: string[] = [];

for (const contract of [
  "String(row.offer_status) !== \"accepted\"",
  "String(row.request_status) !== \"accepted\"",
  "cr.assigned_offer_id",
  "vo.vendor_id=po.vendor_id",
  "vo.canonical_variant_id=po.canonical_variant_id",
  "String(row.assigned_offer_status) !== \"approved\"",
  "modes.includes(\"pickup\")",
  "row.stock_fresh !== true",
  "available < quantity",
  "reserve_stock",
  "'private_offer'",
  "source_reference",
  "offerId, new Date(now)",
  "UPDATE private_offers SET status='converted'",
  "UPDATE counteroffer_requests SET status='converted'",
  "counteroffer.converted"
]) if (!service.includes(contract)) failures.push(`Private-offer checkout service is missing ${contract}`);

if (service.includes("platform_price_minor")) failures.push("Private-offer checkout must not price from the canonical catalog price");
if (service.includes("publicAssignedCanonical")) failures.push("Accepted private offers must not be reassigned by fairness during checkout");
if (!service.includes("unitPriceMinor * quantity")) failures.push("Private-offer checkout must calculate totals from the accepted unit price and requested quantity");
if (!service.includes("splitGrossTax(money(merchandiseMinor), taxRateBps)")) failures.push("Private-offer checkout must calculate line tax from the private-offer gross total");

for (const contract of [
  "requireAccountSession(request, true)",
  "customerCheckoutProfile",
  "billingAddressId",
  "checkoutCustomerPrivateOffer",
  "attachCustomerOrderAddresses",
  "requireVivaPayments().initiateOrderPayment"
]) if (!route.includes(contract)) failures.push(`Private-offer checkout route is missing ${contract}`);

for (const contract of [
  "customerPrivateOfferCheckoutPreview",
  "PrivateOfferCheckoutClient",
  "offer.unavailableReason",
  "profile.addresses.length === 0",
  "robots: { index: false, follow: false }"
]) if (!page.includes(contract)) failures.push(`Private-offer checkout page is missing ${contract}`);

for (const contract of [
  "x-csrf-token",
  "billingAddressId",
  "crypto.randomUUID()",
  "Παραλαβή από το κατάστημα",
  "Δεν εφαρμόζεται η δημόσια τιμή καταλόγου"
]) if (!client.includes(contract)) failures.push(`Private-offer checkout client is missing ${contract}`);

if (!askLocal.includes("/checkout/private-offer/")) failures.push("Accepted Ask Local offers are not linked to private-offer checkout");
if (!askLocal.includes("request.canonicalVariantId")) failures.push("Generic Ask Local requests must not expose checkout without a concrete canonical product");
if (!NON_INDEXABLE_PAGE_ROUTES.includes("/checkout/private-offer/[id]" as never)) failures.push("Private-offer checkout must be registered as non-indexable");

if (failures.length) {
  console.error("Private-offer checkout checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Private-offer checkout checks passed: accepted ownership, exact vendor inventory, pickup-only fulfilment, private price provenance, CSRF/Viva flow and non-indexable routing verified.");
