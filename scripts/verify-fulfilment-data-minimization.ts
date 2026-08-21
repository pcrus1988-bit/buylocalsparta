import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

function requireText(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) throw new Error(message);
}

function forbidText(haystack: string, needle: string, message: string): void {
  if (haystack.includes(needle)) throw new Error(message);
}

function between(haystack: string, start: string, end: string): string {
  const startAt = haystack.indexOf(start);
  const endAt = haystack.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0) throw new Error(`Could not isolate source contract between ${start} and ${end}`);
  return haystack.slice(startAt, endAt);
}

const [addressService, checkoutRoute, checkoutClient, guardMigration] = await Promise.all([
  source("packages/postgres-runtime/src/customer-addresses.ts"),
  source("apps/web/src/app/api/checkout/route.ts"),
  source("apps/web/src/components/CheckoutPageClient.tsx"),
  source("db/migrations/0101_checkout_request_integrity.sql")
]);

requireText(addressService, 'const mode = orderMode(existing.fulfilment_preference);', "Order snapshot persistence must derive purpose from the stored fulfilment mode");
requireText(addressService, 'if (mode === "local_delivery")', "Local delivery must have an explicit address path");
requireText(addressService, 'shippingSnapshot = localDeliverySnapshot(delivery, customerFullName);', "Local delivery must use its minimized delivery snapshot");
requireText(addressService, 'shippingSnapshot = boxNowSnapshot(existingShipping);', "BOX NOW must preserve only provider/recipient metadata");
requireText(addressService, 'let shippingSnapshot: Record<string, unknown> | null = null;', "Pickup must default to no shipping snapshot");
const localDeliveryFunction = between(addressService, "function localDeliverySnapshot", "function boxNowSnapshot");
forbidText(localDeliveryFunction, "vatNumber", "Local-delivery snapshot must not inherit billing-only VAT data");
const boxNowFunction = between(addressService, "function boxNowSnapshot", "function orderMode");
for (const forbidden of ["line1", "line2", "locality", "region", "vatNumber", "companyName"]) {
  forbidText(boxNowFunction, forbidden, `BOX NOW snapshot must not contain saved-address field ${forbidden}`);
}

requireText(checkoutRoute, 'deliveryAddressId: fulfilmentMode === "local_delivery" ? deliveryAddress?.id : undefined', "Checkout must not attach a delivery address to pickup or BOX NOW orders");
requireText(checkoutRoute, 'const providerDestinationPostcode = boundedString(raw.providerDestinationPostcode', "BOX NOW must use the selected locker postcode");
requireText(checkoutRoute, "assertCheckoutRequestIntegrity", "Checkout must bind idempotency keys to the normalized request");
requireText(checkoutRoute, "checkout_request_guards", "Checkout replay guard must be enforced server-side");

requireText(checkoutClient, 'const needsDeliveryAddress = fulfilmentMode === "local_delivery";', "Checkout UI must request a delivery address only for local delivery");
requireText(checkoutClient, 'deliveryAddressId: needsDeliveryAddress ? effectiveDeliveryAddressId : undefined', "Client must omit delivery address IDs for pickup and BOX NOW");
requireText(checkoutClient, 'providerDestinationPostcode: boxNowLocker?.postcode', "Client must send the selected BOX NOW locker postcode explicitly");
requireText(checkoutClient, "Για παραλαβή από κατάστημα δεν αποθηκεύεται διεύθυνση παράδοσης", "Checkout must explain pickup data minimization to the customer");

requireText(guardMigration, "actor_hash text NOT NULL", "Replay guard must store an actor hash");
requireText(guardMigration, "request_hash text NOT NULL", "Replay guard must store a request hash");
requireText(guardMigration, "REVOKE ALL PRIVILEGES ON TABLE checkout_request_guards FROM PUBLIC, anon, authenticated, service_role", "Replay guard must remain outside Supabase Data API roles");
for (const forbidden of ["recipient_email", "recipient_phone", "address_line", "vat_number"]) {
  forbidText(guardMigration, forbidden, `Replay guard must not persist raw personal field ${forbidden}`);
}

console.log("Fulfilment data-minimization and checkout replay-integrity contracts verified.");
