import { readFileSync } from "node:fs";

const proof = readFileSync("apps/web/src/lib/local-commerce-proof.ts", "utf8");
const card = readFileSync("apps/web/src/components/CatalogProductCard.tsx", "utf8");
const shop = readFileSync("apps/web/src/app/shop/page.tsx", "utf8");
const tracking = readFileSync("apps/web/src/components/CustomerDeliveryWorkspaceClient.tsx", "utf8");

const requiredProofContracts = [
  "sticky_assignments sa",
  "sa.offer_id",
  "vo.fulfilment_modes::text[]",
  "ib.stock_confirmed_at",
  "ib.freshness_ttl_seconds",
  "ib.on_hand - ib.active_reservations - ib.safety_stock - ib.blocked",
  "stockConfirmedToday",
  "Europe/Athens"
];
for (const contract of requiredProofContracts) {
  if (!proof.includes(contract)) throw new Error(`Local commerce proof is missing contract: ${contract}`);
}

if (proof.includes("opening_hours") || proof.includes("sameDay: true")) {
  throw new Error("Differentiator proof must not invent same-day opening-hours truth");
}
if (!card.includes("Τοπικό απόθεμα · σήμερα") || !card.includes("LocalCommerceProof")) {
  throw new Error("Catalogue cards must show evidence-backed local proof");
}
if (card.includes('product.available ? "Διαθέσιμο σήμερα"')) {
  throw new Error("Generic availability must not be labelled as same-day availability");
}
if (!shop.includes("product.localProof?.pickup && product.localProof.stockConfirmedToday")) {
  throw new Error("Natural-language pickup-today must require assigned-offer pickup plus today-confirmed stock");
}
if (!tracking.includes("στάσεις") || !tracking.includes("Επόμενη στάση: εσύ") || !tracking.includes("locationFreshness")) {
  throw new Error("Customer delivery tracking must expose route position and location freshness");
}
if (tracking.includes("ETA") || tracking.includes("arrivalAtMs")) {
  throw new Error("Customer UI must not fabricate a clock ETA before dispatcher timings are persisted");
}

console.log("Great differentiators contracts verified");
