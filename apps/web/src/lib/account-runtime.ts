import {
  CustomerPersonalizationService,
  CustomerRecommendationService,
  InMemoryAuthService,
  InMemoryRateLimiter,
  NotificationService,
  PrivacyRequestService,
  SavedProductAlertService,
  SavedSearchService,
  normalizeSearchText,
  offerStockIsFresh
} from "@buy-local-sparta/core";
import { offers, runtime as commerceRuntime, variants, vendors } from "./demo-runtime.js";
import { canonicalIsPubliclyAllowed } from "./vendor-operations-runtime.js";
import { getCanonicalAvailability, getPublicCatalogProducts } from "./catalog-view.js";
import { categoryCodeMatches } from "./storefront-taxonomy.js";

export const ACCOUNT_SESSION_COOKIE = "bls_session";

const globalKey = "__buyLocalSpartaAccountRuntime" as const;
type AccountRuntime = ReturnType<typeof createAccountRuntime>;
const globals = globalThis as typeof globalThis & { [globalKey]?: AccountRuntime };

export function accountAuthSecret(): string {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for production account sessions");
  return "buy-local-sparta-development-account-auth-secret-not-production";
}

function createAccountRuntime() {
  if (process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME !== "true") {
    throw new Error("Production customer accounts require the PostgreSQL identity/personalization adapter; ephemeral in-memory account runtime is disabled");
  }
  const auth = new InMemoryAuthService({ secret: accountAuthSecret(), sessionTtlMs: 12 * 60 * 60 * 1000 });
  const personalization = new CustomerPersonalizationService();
  const savedProductAlerts = new SavedProductAlertService();
  const savedSearches = new SavedSearchService();
  const recommendations = new CustomerRecommendationService();
  const privacyRequests = new PrivacyRequestService();
  const notifications = new NotificationService();
  const rateLimiter = new InMemoryRateLimiter();
  const now = Date.now();
  const demoEnabled = process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true" || process.env.NODE_ENV !== "production";
  const demoCustomer = demoEnabled ? auth.register({
    email: "customer@demo.local",
    password: "Customer!123",
    roles: ["customer"],
    emailVerified: true,
    now
  }) : undefined;

  if (demoCustomer) notifications.create({
    userId: demoCustomer.id,
    eventType: "account.welcome",
    title: "Καλώς ήρθες στο Buy Local Sparta",
    body: "Οι παραγγελίες, τα αποθηκευμένα προϊόντα και οι τοπικές ειδοποιήσεις σου συγκεντρώνονται εδώ.",
    dedupeKey: `account-welcome:${demoCustomer.id}`,
    now
  });

  return { auth, personalization, savedProductAlerts, savedSearches, recommendations, privacyRequests, notifications, rateLimiter, demoCustomer };
}

export function getAccountRuntime(): AccountRuntime {
  return globals[globalKey] ?? (globals[globalKey] = createAccountRuntime());
}

export function canonicalAvailable(variantId: string, now = Date.now()): boolean {
  if (!canonicalIsPubliclyAllowed(variantId)) return false;
  return (offers[variantId] ?? []).some((offer) => {
    const runtimeOffer = { ...offer, availableToSell: commerceRuntime.inventory.availableToSell(offer.offerId), stockFresh: offerStockIsFresh(offer, now) };
    return commerceRuntime.fairness.evaluateEligibility(runtimeOffer).eligible;
  });
}

export async function currentSavedSearchMatches(query: { q: string; categoryCode?: string; availability?: "any" | "in_stock" | "pickup_today" }): Promise<readonly string[]> {
  const q = normalizeSearchText(query.q);
  const products = await getPublicCatalogProducts();
  const matches: string[] = [];
  for (const product of products) {
    if (q && !normalizeSearchText(product.title).includes(q)) continue;
    if (!categoryCodeMatches(product.categoryCode, query.categoryCode)) continue;
    if (query.availability === "in_stock" || query.availability === "pickup_today") {
      if (!(await getCanonicalAvailability(product.id))?.available) continue;
    }
    matches.push(product.id);
  }
  return matches;
}

export function vendorLabel(vendorId: string): string {
  return vendors.find((vendor) => vendor.id === vendorId)?.name ?? vendorId;
}
