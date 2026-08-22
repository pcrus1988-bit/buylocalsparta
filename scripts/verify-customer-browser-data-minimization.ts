import { readFileSync } from "node:fs";
import {
  customerBrowserAddressProfile,
  customerBrowserCart,
  customerBrowserNotification,
  customerBrowserPreferences,
  customerBrowserPrivacyRequest,
  customerBrowserRecentlyViewed,
  customerBrowserSavedProductAlert,
  customerBrowserSavedSearch
} from "../apps/web/src/lib/customer-account-browser-view.ts";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const failures: string[] = [];

function expect(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function keysIn(value: unknown): Set<string> {
  const keys = new Set<string>();
  const visit = (current: unknown) => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      keys.add(key);
      visit(child);
    }
  };
  visit(value);
  return keys;
}

function expectNoKeys(name: string, value: unknown, forbidden: readonly string[]) {
  const keys = keysIn(value);
  for (const key of forbidden) expect(!keys.has(key), `${name} exposed forbidden browser key: ${key}`);
}

const technicalKeys = [
  "userId",
  "customerId",
  "marketId",
  "seenCanonicalVariantIds",
  "dedupeKey",
  "deliveryAttempts",
  "deliveryUpdatedAt",
  "orderId",
  "returnId",
  "requestId",
  "privateOfferId",
  "expiresAt",
  "updatedAt",
  "details",
  "outcome"
] as const;

const preferencesSource = { userId: "usr_private", recommendationsEnabled: true, recentlyViewedEnabled: false, updatedAt: 123 };
const preferences = customerBrowserPreferences(preferencesSource);
expect(preferences.recommendationsEnabled && !preferences.recentlyViewedEnabled, "Preferences projection lost browser controls");
expectNoKeys("preferences", preferences, technicalKeys);

const alertSource = { userId: "usr_private", canonicalVariantId: "variant_1", backInStockEnabled: true, priceDropEnabled: true, minimumPriceDropMinor: 500, updatedAt: 123 };
const alert = customerBrowserSavedProductAlert(alertSource);
expect(alert.minimumPriceDropMinor === 500, "Saved-product alert projection lost its price threshold");
expectNoKeys("saved-product alert", alert, technicalKeys);

const searchSource = {
  id: "search_public",
  userId: "usr_private",
  marketId: "market_private",
  name: "Local gifts",
  alertsEnabled: true,
  lastObservedCount: 3,
  seenCanonicalVariantIds: ["variant_private"],
  createdAt: 100,
  updatedAt: 123,
  query: { q: "gift", categoryCode: "gifts", availability: "in_stock" as const }
};
const search = customerBrowserSavedSearch(searchSource);
expect(search.query.q === "gift" && search.lastObservedCount === 3, "Saved-search projection lost customer-visible search state");
expectNoKeys("saved search", search, technicalKeys);

const recentSource = { userId: "usr_private", canonicalVariantId: "variant_public", viewedAt: 123, expiresAt: 456 };
const recent = customerBrowserRecentlyViewed(recentSource);
expect(recent.canonicalVariantId === "variant_public" && recent.viewedAt === 123, "Recent-view projection lost visible history state");
expectNoKeys("recent view", recent, technicalKeys);

const privacySource = { id: "privacy_public", userId: "usr_private", type: "access", status: "submitted", details: "private note", outcome: "private result", submittedAt: 100, targetAt: 200, updatedAt: 123 };
const privacy = customerBrowserPrivacyRequest(privacySource);
expect(privacy.id === "privacy_public" && privacy.targetAt === 200, "Privacy-request projection lost visible lifecycle state");
expectNoKeys("privacy request", privacy, technicalKeys);

const notificationSource = {
  id: "notification_public",
  userId: "usr_private",
  eventType: "order.ready",
  title: "Ready",
  body: "Your order is ready",
  group: "orders",
  channel: "in_app",
  purpose: "transactional",
  status: "queued",
  dedupeKey: "private-dedupe",
  deliveryAttempts: 2,
  createdAt: 123,
  payload: {
    orderReference: "BLS-20260822-SAFE",
    canonicalVariantId: "variant_public",
    orderId: "order_private",
    returnId: "return_private",
    requestId: "request_private",
    privateOfferId: "offer_private",
    userId: "usr_private",
    url: "https://evil.example",
    numericValue: 42,
    oversized: "x".repeat(241)
  }
};
const notification = customerBrowserNotification(notificationSource);
expect(notification.payload.orderReference === "BLS-20260822-SAFE", "Notification projection lost its public order reference");
expect(notification.payload.canonicalVariantId === "variant_public", "Notification projection lost its public product reference");
expect(Object.keys(notification.payload).length === 2, "Notification payload projection is not a strict string allowlist");
expectNoKeys("notification", notification, technicalKeys);

const addressSource = {
  customerId: "usr_private",
  fullName: "Customer Name",
  addresses: [{
    id: "address_public",
    userId: "usr_private",
    label: "Home",
    fullName: "Customer Name",
    line1: "1 Main Street",
    locality: "Sparta",
    postcode: "23100",
    countryCode: "GR",
    isDefaultBilling: true,
    isDefaultDelivery: true,
    updatedAt: 123
  }]
};
const addressProfile = customerBrowserAddressProfile(addressSource);
expect(addressProfile.addresses[0]?.postcode === "23100", "Address projection lost checkout fields");
expectNoKeys("address profile", addressProfile, technicalKeys);

const cartSource = {
  id: "cart_private",
  customerId: "usr_private",
  marketId: "market_private",
  updatedAt: 123,
  items: [{ canonicalVariantId: "variant_public", title: "Local product", quantity: 2, priceMinor: 1500, currency: "EUR", available: true, vendorId: "vendor_private" }]
};
const cart = customerBrowserCart(cartSource);
expect(cart?.items[0]?.quantity === 2 && cart.items[0]?.priceMinor === 1500, "Cart projection lost browser-visible item state");
expectNoKeys("cart", cart, [...technicalKeys, "vendorId"]);

const accountView = read("apps/web/src/lib/account-view.ts");
for (const contract of [
  "account: { email: principal.email }",
  "state.savedSearches.map(customerBrowserSavedSearch)",
  "state.notifications.map(customerBrowserNotification)",
  "customerBrowserPreferences(state.preferences)",
  "state.privacyRequests.map(customerBrowserPrivacyRequest)",
  "customerBrowserRecentlyViewed(view)",
  "customerBrowserSavedProductAlert(alert)"
]) expect(accountView.includes(contract), `Account dashboard is missing browser projection contract: ${contract}`);
expect(!accountView.includes("account: { userId:"), "Account dashboard must not serialize the session user id");
expect(!accountView.includes("{ ...saved"), "Account dashboard must not spread raw saved-product records into browser state");
expect(!accountView.includes("{ ...view"), "Account dashboard must not spread raw recent-view records into browser state");

const routeContracts: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["apps/web/src/app/api/account/cart/route.ts", ["customerBrowserCart(cart)"]],
  ["apps/web/src/app/api/account/addresses/route.ts", ["customerBrowserAddressProfile("]],
  ["apps/web/src/app/api/account/preferences/route.ts", ["customerBrowserPreferences(preferences)"]],
  ["apps/web/src/app/api/account/recent-view/route.ts", ["customerBrowserRecentlyViewed(viewed)"]],
  ["apps/web/src/app/api/account/saved-products/[id]/route.ts", ["customerBrowserSavedProductAlert(result.alert)", "saved: { canonicalVariantId: result.saved.canonicalVariantId }"]],
  ["apps/web/src/app/api/account/saved-searches/route.ts", ["customerBrowserSavedSearch(saved)"]],
  ["apps/web/src/app/api/account/saved-searches/[id]/route.ts", ["customerBrowserSavedSearch(search)"]],
  ["apps/web/src/app/api/account/privacy/export/route.ts", ["customerBrowserPrivacyRequest(item)"]],
  ["apps/web/src/app/api/account/privacy/request/route.ts", ["customerBrowserPrivacyRequest(item)"]],
  ["apps/web/src/app/api/account/ask-local/route.ts", ["customerAskLocalBrowserRequests(principal)", "customerAskLocalBrowserRequest(principal, created)"]]
];
for (const [path, contracts] of routeContracts) {
  const source = read(path);
  for (const contract of contracts) expect(source.includes(contract), `${path} is missing browser projection contract: ${contract}`);
}

const loginRoute = read("apps/web/src/app/api/account/login/route.ts");
expect(loginRoute.includes("{ authenticated: true }"), "Login success must return only the authentication outcome");
expect(loginRoute.includes('"Cache-Control": "no-store"'), "Login success response must not be cached");
expect(!loginRoute.includes("result.principal.userId") && !loginRoute.includes("result.principal.csrfToken"), "Login success must not serialize session identifiers or CSRF state");

const sessionRoute = read("apps/web/src/app/api/account/session/route.ts");
expect(sessionRoute.includes('"Cache-Control": "no-store"'), "Account session response must not be cached");

const addressService = read("packages/postgres-runtime/src/customer-addresses.ts");
const checkoutProfile = addressService.match(/export type CustomerCheckoutProfile = Readonly<\{([\s\S]*?)\}>;/)?.[1] ?? "";
expect(Boolean(checkoutProfile), "Customer checkout profile type could not be inspected");
expect(!checkoutProfile.includes("customerId"), "Customer checkout profile must not carry a browser-facing customer id");

if (failures.length) {
  console.error("Customer browser data-minimization checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer browser data-minimization checks passed: account/session/login/cart/address and customer-state responses expose explicit UI fields, notifications use a strict safe-reference allowlist, and technical customer/workflow identifiers remain server-side.");
