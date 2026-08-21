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

const [addressService, checkoutRoute, checkoutClient, guardMigration, vendorRuntime, vendorOrdersClient, vendorDeliveryRoute, vendorOperations, dailyOrdersClient, dailyDeliveryRoute] = await Promise.all([
  source("packages/postgres-runtime/src/customer-addresses.ts"),
  source("apps/web/src/app/api/checkout/route.ts"),
  source("apps/web/src/components/CheckoutPageClient.tsx"),
  source("db/migrations/0101_checkout_request_integrity.sql"),
  source("apps/web/src/lib/vendor-runtime.ts"),
  source("apps/web/src/components/VendorOrdersClient.tsx"),
  source("apps/web/src/app/api/vendor/fulfilments/delivery-contact/route.ts"),
  source("packages/postgres-runtime/src/vendor-operations.ts"),
  source("apps/web/src/components/VendorDailyOrdersClient.tsx"),
  source("apps/web/src/app/api/daily/fulfilments/delivery-contact/route.ts")
]);

requireText(addressService, 'const mode = orderMode(existing.fulfilment_preference);', "Order snapshot persistence must derive purpose from the stored fulfilment mode");
requireText(addressService, 'if (mode === "local_delivery")', "Local delivery must have an explicit address path");
requireText(addressService, 'shippingSnapshot = localDeliverySnapshot(delivery, customerFullName);', "Local delivery must use its minimized delivery snapshot");
requireText(addressService, 'shippingSnapshot = boxNowSnapshot(existingShipping);', "BOX NOW must preserve only provider/recipient metadata");
requireText(addressService, 'let shippingSnapshot: Record<string, unknown> | null = null;', "Pickup must default to no shipping snapshot");
requireText(addressService, 'shippingSnapshot === null ? null : JSON.stringify(shippingSnapshot)', "Pickup must persist SQL NULL rather than JSONB null for the absent shipping snapshot");
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

const vendorDashboardQuery = between(vendorOperations, "async dashboard", "async updateStock");
for (const forbidden of ["->>'recipientName'", "->>'recipientEmail'", "->>'recipientPhone'", "->>'line1'", "->>'phone'"]) {
  forbidText(vendorDashboardQuery, forbidden, `Vendor dashboard must not preload personal delivery field ${forbidden}`);
}
requireText(vendorRuntime, 'if (!["accepted", "picking", "packed", "ready_for_handover"].includes(fulfilmentStatus))', "Vendor delivery reveal must be limited to active accepted fulfilments");
requireText(vendorRuntime, 'accessRoute = "/api/vendor/fulfilments/delivery-contact"', "Shared delivery reveal must default to the vendor route while allowing the Daily route to be recorded accurately");
requireText(vendorRuntime, 'type: "personal_data.revealed"', "Vendor delivery reveal must create a personal-data access event");
requireText(vendorRuntime, 'purpose: "order_fulfilment"', "Vendor delivery reveal must record its fulfilment purpose");
requireText(vendorRuntime, 'dataClasses: "identity,contact,address"', "Vendor delivery reveal must record disclosed data classes");
requireText(vendorDeliveryRoute, "requireVendorSession(request, true)", "Vendor delivery reveal endpoint must require authenticated CSRF-protected vendor access");
requireText(vendorDeliveryRoute, '"cache-control": "no-store, private"', "Vendor delivery contact responses must not be cached");
requireText(vendorOrdersClient, "Εμφάνιση στοιχείων παράδοσης", "Vendor must explicitly request local-delivery personal data");
requireText(vendorOrdersClient, "Η πρόσβαση καταγράφεται", "Vendor UI must tell the operator that personal-data access is logged");
requireText(vendorOrdersClient, 'delete next[fulfilmentId]', "Revealed delivery data must be removable from vendor client state after use/status change");

requireText(dailyDeliveryRoute, "requireDailySession(request, true)", "Daily delivery reveal endpoint must require authenticated CSRF-protected Daily access");
requireText(dailyDeliveryRoute, 'vendorLocalDeliveryContact(principal, fulfilmentId, "/api/daily/fulfilments/delivery-contact")', "Daily must reuse the shared delivery reveal policy and record its own access route");
requireText(dailyDeliveryRoute, '"cache-control": "no-store, private"', "Daily delivery contact responses must not be cached");
requireText(dailyOrdersClient, 'fetch("/api/daily/fulfilments/delivery-contact"', "Daily must fetch delivery data only after an explicit operator action");
requireText(dailyOrdersClient, "Δεν φορτώνονται αυτόματα", "Daily must explain that delivery personal data is not preloaded");
requireText(dailyOrdersClient, "Η πρόσβαση καταγράφεται", "Daily must disclose that personal-data access is logged");
requireText(dailyOrdersClient, 'delete next[item.id]', "Daily must remove revealed delivery data from client state after completion/rejection");

requireText(guardMigration, "actor_hash text NOT NULL", "Replay guard must store an actor hash");
requireText(guardMigration, "request_hash text NOT NULL", "Replay guard must store a request hash");
requireText(guardMigration, "REVOKE ALL PRIVILEGES ON TABLE checkout_request_guards FROM PUBLIC, anon, authenticated, service_role", "Replay guard must remain outside Supabase Data API roles");
for (const forbidden of ["recipient_email", "recipient_phone", "address_line", "vat_number"]) {
  forbidText(guardMigration, forbidden, `Replay guard must not persist raw personal field ${forbidden}`);
}

console.log("Fulfilment data-minimization, audited vendor/Daily reveals and checkout replay-integrity contracts verified.");
