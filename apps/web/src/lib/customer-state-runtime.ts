import {
  NotificationService,
  PrivacyRequestService,
  SavedSearchService,
  id,
  type Notification,
  type PersonalizationPreferences,
  type PrivacyRequest,
  type RecentlyViewedProduct,
  type SavedProduct,
  type SavedProductAlertPreference,
  type SavedSearch,
  type SavedSearchQuery,
  type SessionPrincipal
} from "@buy-local-sparta/core";
import {
  PostgresCustomerAuthService,
  PostgresFixedWindowRateLimiter,
  customerScope
} from "@buy-local-sparta/postgres-runtime";
import { accountAuthSecret, getAccountRuntime } from "./account-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { assertDatabaseLessPreviewCsrf, createDatabaseLessPreviewSession, databaseLessPreviewSessionEnabled, databaseLessPreviewSessionFromToken, previewCredentialMatches } from "./preview-auth";

const DAY = 24 * 60 * 60 * 1000;
const postgresGlobals = globalThis as typeof globalThis & {
  __blsCustomerPostgresAuth?: PostgresCustomerAuthService;
  __blsCustomerPostgresRateLimiter?: PostgresFixedWindowRateLimiter;
};

export type CustomerStateSnapshot = Readonly<{
  preferences: PersonalizationPreferences;
  savedProducts: readonly SavedProduct[];
  recentlyViewed: readonly RecentlyViewedProduct[];
  savedSearches: readonly SavedSearch[];
  savedProductAlerts: readonly SavedProductAlertPreference[];
  notifications: readonly (Notification & { group: string })[];
  unreadNotifications: number;
  privacyRequests: readonly PrivacyRequest[];
}>;

export function customerStateBackend(): "postgres" | "memory" {
  if (process.env.DATABASE_URL?.trim()) return "postgres";
  if (process.env.NODE_ENV === "production" && process.env.BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME !== "true") {
    throw new Error("Production customer state requires DATABASE_URL; ephemeral account state is disabled");
  }
  return "memory";
}

function postgresServices() {
  const runtime = getProductionPostgresRuntime();
  const auth = postgresGlobals.__blsCustomerPostgresAuth ??= new PostgresCustomerAuthService({
    identity: runtime.persistence.identity,
    secret: accountAuthSecret(),
    sessionTtlMs: 12 * 60 * 60 * 1000
  });
  const rateLimiter = postgresGlobals.__blsCustomerPostgresRateLimiter ??= new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  return { runtime, auth, rateLimiter };
}

export async function authenticateCustomer(input: { email: string; password: string; now: number }) {
  if (customerStateBackend() === "memory") {
    if (databaseLessPreviewSessionEnabled("customer")) {
      const email = input.email.trim().toLowerCase();
      if (email !== "customer@demo.local" || !previewCredentialMatches(input.password, "Customer!123")) throw new Error("Invalid email or password");
      return createDatabaseLessPreviewSession({ kind: "customer", userId: "preview_customer", email, roles: ["customer"], now: input.now, ttlMs: 12 * 60 * 60 * 1000 });
    }
    return getAccountRuntime().auth.authenticate(input);
  }
  return postgresServices().auth.authenticate(input);
}

export async function customerSession(token: string | undefined, now: number): Promise<SessionPrincipal | undefined> {
  if (customerStateBackend() === "memory") {
    if (databaseLessPreviewSessionEnabled("customer")) return databaseLessPreviewSessionFromToken(token, "customer", now);
    return getAccountRuntime().auth.session(token, now);
  }
  return postgresServices().auth.session(token, now);
}

export function assertCustomerCsrf(principal: SessionPrincipal, supplied: string | undefined): void {
  if (customerStateBackend() === "memory") {
    if (databaseLessPreviewSessionEnabled("customer")) return assertDatabaseLessPreviewCsrf(principal, supplied);
    return getAccountRuntime().auth.assertCsrf(principal, supplied);
  }
  return postgresServices().auth.assertCsrf(principal, supplied);
}

export async function logoutCustomer(token: string | undefined, now = Date.now()): Promise<void> {
  if (customerStateBackend() === "memory") {
    if (!databaseLessPreviewSessionEnabled("customer")) getAccountRuntime().auth.logout(token);
    return;
  }
  await postgresServices().auth.logout(token, now);
}

export async function consumeCustomerLoginRateLimit(input: { visitorKey: string; now: number }) {
  if (customerStateBackend() === "memory") {
    return getAccountRuntime().rateLimiter.consume({ key: `web-login:${input.visitorKey}`, rule: { limit: 5, windowMs: 15 * 60 * 1000 }, now: input.now });
  }
  return postgresServices().rateLimiter.consume({ route: "customer-login", key: input.visitorKey, limit: 5, windowMs: 15 * 60 * 1000, now: input.now });
}

export async function customerStateSnapshot(userId: string, now = Date.now()): Promise<CustomerStateSnapshot> {
  if (customerStateBackend() === "memory") {
    const memory = getAccountRuntime();
    const notifications = memory.notifications.centerForUser(userId);
    return {
      preferences: memory.personalization.preferences(userId, now),
      savedProducts: memory.personalization.savedProducts(userId),
      recentlyViewed: memory.personalization.recentlyViewed(userId, now),
      savedSearches: memory.savedSearches.forUser(userId),
      savedProductAlerts: memory.savedProductAlerts.forUser(userId),
      notifications,
      unreadNotifications: notifications.filter((item) => !item.readAt).length,
      privacyRequests: memory.privacyRequests.forUser(userId)
    };
  }
  const { runtime } = postgresServices();
  const scope = customerScope(userId);
  const [personalization, savedSearches, alerts, notifications, privacyRequests] = await Promise.all([
    runtime.persistence.customerPrivacy.listForUser({ scope, userId, now }),
    runtime.persistence.engagement.listSavedSearches({ scope, userId }),
    runtime.persistence.engagement.listAlertPreferences({ scope, userId }),
    runtime.persistence.notificationOperations.centerForUser({ scope, userId }),
    runtime.persistence.customerPrivacy.privacyRequestsForUser({ scope, userId })
  ]);
  return {
    preferences: personalization.preferences,
    savedProducts: personalization.savedProducts,
    recentlyViewed: personalization.recentlyViewed,
    savedSearches,
    savedProductAlerts: alerts,
    notifications,
    unreadNotifications: notifications.filter((item) => !item.readAt).length,
    privacyRequests
  };
}

export async function updateCustomerPreferences(input: { userId: string; recommendationsEnabled?: boolean; recentlyViewedEnabled?: boolean; now: number }) {
  if (customerStateBackend() === "memory") return getAccountRuntime().personalization.updatePreferences(input);
  const { runtime } = postgresServices();
  const scope = customerScope(input.userId);
  const current = (await runtime.persistence.customerPrivacy.listForUser({ scope, userId: input.userId, now: input.now })).preferences;
  const preferences: PersonalizationPreferences = {
    userId: input.userId,
    recommendationsEnabled: input.recommendationsEnabled ?? current.recommendationsEnabled,
    recentlyViewedEnabled: input.recentlyViewedEnabled ?? current.recentlyViewedEnabled,
    updatedAt: input.now
  };
  await runtime.persistence.customerPrivacy.savePreferences({ scope, preferences });
  return preferences;
}

export async function saveCustomerProduct(input: { userId: string; canonicalVariantId: string; available: boolean; priceMinor: number; now: number }) {
  if (customerStateBackend() === "memory") {
    const runtime = getAccountRuntime();
    const saved = runtime.personalization.saveProduct(input.userId, input.canonicalVariantId, input.now);
    const alert = runtime.savedProductAlerts.configure({
      userId: input.userId,
      canonicalVariantId: input.canonicalVariantId,
      backInStockEnabled: true,
      priceDropEnabled: true,
      minimumPriceDropMinor: 100,
      currentAvailable: input.available,
      currentPriceMinor: input.priceMinor,
      now: input.now
    });
    return { saved, alert };
  }
  const { runtime } = postgresServices();
  const scope = customerScope(input.userId);
  const existing = (await runtime.persistence.engagement.listAlertPreferences({ scope, userId: input.userId })).find((item) => item.canonicalVariantId === input.canonicalVariantId);
  const saved: SavedProduct = { userId: input.userId, canonicalVariantId: input.canonicalVariantId, savedAt: input.now };
  const alert: SavedProductAlertPreference = {
    id: existing?.id ?? id("saved-alert"),
    userId: input.userId,
    canonicalVariantId: input.canonicalVariantId,
    backInStockEnabled: true,
    priceDropEnabled: true,
    minimumPriceDropMinor: existing?.minimumPriceDropMinor ?? 100,
    lastObservedAvailable: input.available,
    lastObservedPriceMinor: input.priceMinor,
    lastObservedAt: input.now,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now
  };
  await runtime.persistence.customerPrivacy.saveProduct({ scope, item: saved });
  await runtime.persistence.engagement.saveAlertPreference({ scope, preference: alert });
  return { saved, alert };
}

export async function removeCustomerProduct(input: { userId: string; canonicalVariantId: string }) {
  if (customerStateBackend() === "memory") {
    const memory = getAccountRuntime();
    const removed = memory.personalization.unsaveProduct(input.userId, input.canonicalVariantId);
    memory.savedProductAlerts.remove(input.userId, input.canonicalVariantId);
    return removed;
  }
  const { runtime } = postgresServices();
  const scope = customerScope(input.userId);
  await runtime.persistence.customerPrivacy.removeProduct({ scope, ...input });
  await runtime.persistence.engagement.removeAlertPreference({ scope, ...input });
  return true;
}

export async function recordCustomerView(input: { userId: string; canonicalVariantId: string; now: number }): Promise<RecentlyViewedProduct | undefined> {
  if (customerStateBackend() === "memory") return getAccountRuntime().personalization.recordView(input.userId, input.canonicalVariantId, input.now);
  const { runtime } = postgresServices();
  const scope = customerScope(input.userId);
  const current = await runtime.persistence.customerPrivacy.listForUser({ scope, userId: input.userId, now: input.now });
  if (!current.preferences.recentlyViewedEnabled) return undefined;
  const item: RecentlyViewedProduct = { userId: input.userId, canonicalVariantId: input.canonicalVariantId, viewedAt: input.now, expiresAt: input.now + 90 * DAY };
  await runtime.persistence.customerPrivacy.recordRecentlyViewed({ scope, item });
  return item;
}

export async function createCustomerSavedSearch(input: { userId: string; marketId: string; name?: string; query: SavedSearchQuery; alertsEnabled?: boolean; currentCanonicalVariantIds: readonly string[]; now: number }) {
  if (customerStateBackend() === "memory") return getAccountRuntime().savedSearches.create(input);
  const created = new SavedSearchService().create(input);
  const { runtime } = postgresServices();
  await runtime.persistence.engagement.saveSavedSearch({ scope: customerScope(input.userId), search: created });
  return created;
}

export async function markAllCustomerNotificationsRead(input: { userId: string; now: number }): Promise<number> {
  if (customerStateBackend() === "memory") return getAccountRuntime().notifications.markAllRead(input);
  return postgresServices().runtime.persistence.notificationOperations.markAllRead({ scope: customerScope(input.userId), userId: input.userId, now: input.now });
}

export async function createCustomerNotification(input: { userId: string; eventType: string; title: string; body: string; payload?: Record<string, unknown>; dedupeKey?: string; now: number }) {
  if (customerStateBackend() === "memory") return getAccountRuntime().notifications.create(input);
  const { runtime } = postgresServices();
  const readScope = customerScope(input.userId);
  if (input.dedupeKey) {
    const existing = (await runtime.persistence.notificationOperations.centerForUser({ scope: readScope, userId: input.userId, includeArchived: true })).find((item) => item.dedupeKey === input.dedupeKey);
    if (existing) return existing;
  }
  const notification = new NotificationService().create(input);
  await runtime.persistence.trust.saveNotification({ scope: { actorUserId: input.userId, marketId: "sparta", platformAccess: true }, notification });
  return notification;
}

export async function submitCustomerPrivacyExport(input: { userId: string; now: number }): Promise<PrivacyRequest> {
  if (customerStateBackend() === "memory") return getAccountRuntime().privacyRequests.submit({ userId: input.userId, type: "export", now: input.now });
  const { runtime } = postgresServices();
  const scope = customerScope(input.userId);
  const existing = (await runtime.persistence.customerPrivacy.privacyRequestsForUser({ scope, userId: input.userId }))
    .find((item) => item.type === "export" && ["submitted", "processing"].includes(item.status));
  if (existing) return existing;
  const request = new PrivacyRequestService().submit({ userId: input.userId, type: "export", now: input.now });
  await runtime.persistence.customerPrivacy.savePrivacyRequest({ scope, request });
  return request;
}

export async function platformPrivacyRequests(actorUserId: string): Promise<readonly PrivacyRequest[]> {
  if (customerStateBackend() === "memory") return getAccountRuntime().privacyRequests.all();
  return postgresServices().runtime.persistence.customerPrivacy.privacyRequestsForPlatform({ scope: { actorUserId, marketId: "sparta", platformAccess: true } });
}

export async function platformPrivacyAction(input: { actorUserId: string; requestId: string; action: "start" | "complete" | "partial"; now: number; retention: readonly import("@buy-local-sparta/core").PrivacyRetentionItem[] }) {
  if (customerStateBackend() === "memory") {
    const service = getAccountRuntime().privacyRequests;
    return input.action === "start"
      ? service.start({ requestId: input.requestId, actorId: input.actorUserId, now: input.now })
      : service.complete({ requestId: input.requestId, actorId: input.actorUserId, now: input.now, status: input.action === "partial" ? "partially_completed" : "completed", retention: input.action === "partial" ? input.retention : [], outcome: { processedBy: "Buy Local Sparta privacy operations" } });
  }
  const { runtime } = postgresServices();
  const scope = { actorUserId: input.actorUserId, marketId: "sparta", platformAccess: true } as const;
  const all = await runtime.persistence.customerPrivacy.privacyRequestsForPlatform({ scope });
  const current = all.find((item) => item.id === input.requestId);
  if (!current) throw new Error("Privacy request not found");
  if (!["submitted", "processing"].includes(current.status)) throw new Error("Privacy request is already terminal");
  const next: PrivacyRequest = input.action === "start"
    ? { ...current, status: "processing", processingStartedAt: input.now, outcome: { ...(current.outcome ?? {}), processingActor: input.actorUserId } }
    : { ...current, status: input.action === "partial" ? "partially_completed" : "completed", completedAt: input.now, completedBy: input.actorUserId, retention: input.action === "partial" ? input.retention : [], outcome: { processedBy: "Buy Local Sparta privacy operations" } };
  await runtime.persistence.customerPrivacy.savePrivacyRequest({ scope, request: next });
  return next;
}
