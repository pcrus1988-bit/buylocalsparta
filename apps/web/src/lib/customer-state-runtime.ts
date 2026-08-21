import {
  NotificationService,
  PersonalizationService,
  PrivacyRequestService,
  RecommendationService,
  SavedProductAlertService,
  SavedSearchService,
  id,
  type CustomerRecommendation,
  type Notification,
  type PersonalizationPreferences,
  type PrivacyRequest,
  type RecentlyViewedProduct,
  type SavedProduct,
  type SavedProductAlertPreference,
  type SavedSearch,
  type SavedSearchQuery
} from "@buy-local-sparta/core";
import { createPostgresRuntimeFromEnv, type ProductionPostgresRuntime } from "@buy-local-sparta/postgres-runtime";
import { getAccountRuntime } from "./account-runtime";

const DAY = 24 * 60 * 60 * 1000;
type CustomerStateBackend = "memory" | "postgres";

export type CustomerStateSnapshot = Readonly<{
  savedProducts: readonly SavedProduct[];
  savedProductAlerts: readonly SavedProductAlertPreference[];
  savedSearches: readonly SavedSearch[];
  notifications: readonly (Notification & { group: string })[];
  unreadNotifications: number;
  recentlyViewed: readonly RecentlyViewedProduct[];
  preferences: PersonalizationPreferences;
  privacyRequests: readonly PrivacyRequest[];
}>;

type PostgresServices = Readonly<{
  runtime: ProductionPostgresRuntime;
}>;

const globals = globalThis as typeof globalThis & { __blsCustomerStatePostgres?: PostgresServices };

function customerStateBackend(): CustomerStateBackend {
  if (process.env.NODE_ENV === "production") return "postgres";
  return process.env.BLS_CUSTOMER_STATE_BACKEND === "postgres" ? "postgres" : "memory";
}

function postgresServices(): PostgresServices {
  if (!globals.__blsCustomerStatePostgres) {
    globals.__blsCustomerStatePostgres = { runtime: createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta:customer-state" }) };
  }
  return globals.__blsCustomerStatePostgres;
}

function customerScope(userId: string) {
  return { actorUserId: userId, marketId: "sparta" } as const;
}

export async function customerStateSnapshot(userId: string, now: number): Promise<CustomerStateSnapshot> {
  if (customerStateBackend() === "memory") {
    const runtime = getAccountRuntime();
    return {
      savedProducts: runtime.personalization.savedProductsForUser(userId),
      savedProductAlerts: runtime.savedProductAlerts.forUser(userId),
      savedSearches: runtime.savedSearches.forUser(userId),
      notifications: runtime.notifications.centerForUser(userId),
      unreadNotifications: runtime.notifications.unreadForUser(userId),
      recentlyViewed: runtime.personalization.recentlyViewed(userId, now),
      preferences: runtime.personalization.preferencesFor(userId),
      privacyRequests: runtime.privacyRequests.forUser(userId)
    };
  }

  const { runtime } = postgresServices();
  const scope = customerScope(userId);
  const [savedProducts, savedProductAlerts, savedSearches, notifications, privacyState] = await Promise.all([
    runtime.persistence.customerPrivacy.savedProductsForUser({ scope, userId }),
    runtime.persistence.engagement.listAlertPreferences({ scope, userId }),
    runtime.persistence.engagement.listSavedSearches({ scope, userId }),
    runtime.persistence.notificationOperations.centerForUser({ scope, userId }),
    runtime.persistence.customerPrivacy.listForUser({ scope, userId, now })
  ]);
  return {
    savedProducts,
    savedProductAlerts,
    savedSearches,
    notifications,
    unreadNotifications: notifications.filter((item) => !item.readAt).length,
    recentlyViewed: privacyState.recentlyViewed,
    preferences: privacyState.preferences,
    privacyRequests: privacyState.requests
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

export async function markCustomerNotificationRead(input: { userId: string; notificationId: string; now: number }): Promise<void> {
  if (customerStateBackend() === "memory") {
    getAccountRuntime().notifications.markRead({ id: input.notificationId, userId: input.userId, now: input.now });
    return;
  }
  const { runtime } = postgresServices();
  const result = await runtime.sqlPool.query(`
    UPDATE notifications n
    SET read_at=COALESCE(n.read_at,$3)
    FROM users u
    WHERE n.public_id=$1
      AND n.user_id=u.id
      AND u.public_id=$2
      AND n.channel='in_app'
      AND n.archived_at IS NULL
    RETURNING n.public_id
  `, [input.notificationId, input.userId, new Date(input.now)]);
  if (result.rowCount !== 1) throw new Error("Notification not found or not readable by this user");
}

export async function archiveCustomerNotification(input: { userId: string; notificationId: string; now: number }): Promise<void> {
  if (customerStateBackend() === "memory") {
    getAccountRuntime().notifications.archive({ id: input.notificationId, userId: input.userId, now: input.now });
    return;
  }
  const { runtime } = postgresServices();
  await runtime.persistence.notificationOperations.archiveForUser({
    scope: customerScope(input.userId),
    userId: input.userId,
    notificationId: input.notificationId,
    now: input.now
  });
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

export async function customerRecommendations(input: { userId: string; availableProducts: readonly { canonicalVariantId: string; categoryCode: string; brand?: string; available: boolean; adviceAvailable?: boolean }[]; now: number }): Promise<readonly CustomerRecommendation[]> {
  const state = await customerStateSnapshot(input.userId, input.now);
  return new RecommendationService().recommend({
    preferences: state.preferences,
    savedProducts: state.savedProducts,
    recentlyViewed: state.recentlyViewed,
    availableProducts: input.availableProducts,
    limit: 8
  });
}
