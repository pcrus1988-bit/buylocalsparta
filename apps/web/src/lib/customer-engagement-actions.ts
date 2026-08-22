import { id, PostgresUnitOfWork, type SavedProductAlertPreference, type SavedSearch, type SessionPrincipal } from "@buy-local-sparta/core";
import { customerScope } from "@buy-local-sparta/postgres-runtime";
import { currentSavedSearchMatches, getAccountRuntime } from "./account-runtime";
import { getCanonicalAvailability, getCanonicalProductSummary } from "./catalog-view";
import { customerStateBackend, customerStateSnapshot } from "./customer-state-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export async function configureCustomerSavedSearch(
  principal: SessionPrincipal,
  input: { searchId: string; alertsEnabled: boolean; now?: number }
): Promise<SavedSearch> {
  const searchId = input.searchId.trim();
  if (!searchId) throw new Error("Η αποθηκευμένη αναζήτηση είναι υποχρεωτική.");
  const now = input.now ?? Date.now();

  if (customerStateBackend() === "memory") {
    const runtime = getAccountRuntime();
    const current = runtime.savedSearches.get(searchId);
    if (!current || current.userId !== principal.userId) throw new Error("Η αποθηκευμένη αναζήτηση δεν βρέθηκε.");
    const currentCanonicalVariantIds = await currentSavedSearchMatches({
      q: current.query.q,
      categoryCode: current.query.categoryCode,
      availability: current.query.availability
    });
    return runtime.savedSearches.configure({ searchId, userId: principal.userId, alertsEnabled: input.alertsEnabled, currentCanonicalVariantIds, now });
  }

  const runtime = getProductionPostgresRuntime();
  const scope = customerScope(principal.userId);
  const searches = await runtime.persistence.engagement.listSavedSearches({ scope, userId: principal.userId });
  const current = searches.find((item) => item.id === searchId);
  if (!current) throw new Error("Η αποθηκευμένη αναζήτηση δεν βρέθηκε.");
  const currentCanonicalVariantIds = await currentSavedSearchMatches({
    q: current.query.q,
    categoryCode: current.query.categoryCode,
    availability: current.query.availability
  });
  const baseline = [...new Set([...current.seenCanonicalVariantIds, ...currentCanonicalVariantIds])].slice(-500);
  const next: SavedSearch = {
    ...current,
    alertsEnabled: input.alertsEnabled,
    seenCanonicalVariantIds: baseline,
    lastObservedCount: currentCanonicalVariantIds.length,
    lastObservedAt: now,
    updatedAt: now
  };
  await runtime.persistence.engagement.saveSavedSearch({ scope, search: next });
  return next;
}

export async function removeCustomerSavedSearch(principal: SessionPrincipal, searchIdValue: string): Promise<void> {
  const searchId = searchIdValue.trim();
  if (!searchId) throw new Error("Η αποθηκευμένη αναζήτηση είναι υποχρεωτική.");
  if (customerStateBackend() === "memory") {
    const removed = getAccountRuntime().savedSearches.remove({ searchId, userId: principal.userId });
    if (!removed) throw new Error("Η αποθηκευμένη αναζήτηση δεν βρέθηκε.");
    return;
  }
  const runtime = getProductionPostgresRuntime();
  const scope = customerScope(principal.userId);
  const searches = await runtime.persistence.engagement.listSavedSearches({ scope, userId: principal.userId });
  if (!searches.some((item) => item.id === searchId)) throw new Error("Η αποθηκευμένη αναζήτηση δεν βρέθηκε.");
  await runtime.persistence.engagement.removeSavedSearch({ scope, userId: principal.userId, searchId });
}

export async function configureCustomerSavedProductAlert(
  principal: SessionPrincipal,
  input: { canonicalVariantId: string; backInStockEnabled?: boolean; priceDropEnabled?: boolean; minimumPriceDropMinor?: number; now?: number }
): Promise<SavedProductAlertPreference> {
  const canonicalVariantId = input.canonicalVariantId.trim();
  if (!canonicalVariantId) throw new Error("Το αποθηκευμένο προϊόν είναι υποχρεωτικό.");
  const now = input.now ?? Date.now();
  if (input.minimumPriceDropMinor !== undefined && (!Number.isSafeInteger(input.minimumPriceDropMinor) || input.minimumPriceDropMinor < 0 || input.minimumPriceDropMinor > 100_000_000)) {
    throw new Error("Μη έγκυρο όριο πτώσης τιμής.");
  }
  const [snapshot, product, availability] = await Promise.all([
    customerStateSnapshot(principal.userId, now),
    getCanonicalProductSummary(canonicalVariantId),
    getCanonicalAvailability(canonicalVariantId)
  ]);
  if (!snapshot.savedProducts.some((item) => item.canonicalVariantId === canonicalVariantId)) throw new Error("Το προϊόν δεν βρίσκεται στα αποθηκευμένα σου.");
  if (!product) throw new Error("Το προϊόν δεν είναι πλέον διαθέσιμο στον κατάλογο.");
  const current = snapshot.savedProductAlerts.find((item) => item.canonicalVariantId === canonicalVariantId);

  if (customerStateBackend() === "memory") {
    return getAccountRuntime().savedProductAlerts.configure({
      userId: principal.userId,
      canonicalVariantId,
      backInStockEnabled: input.backInStockEnabled,
      priceDropEnabled: input.priceDropEnabled,
      minimumPriceDropMinor: input.minimumPriceDropMinor,
      currentAvailable: availability?.available ?? false,
      currentPriceMinor: product.priceMinor,
      now
    });
  }

  const preference: SavedProductAlertPreference = {
    id: current?.id ?? id("saved-alert"),
    userId: principal.userId,
    canonicalVariantId,
    backInStockEnabled: input.backInStockEnabled ?? current?.backInStockEnabled ?? false,
    priceDropEnabled: input.priceDropEnabled ?? current?.priceDropEnabled ?? false,
    minimumPriceDropMinor: input.minimumPriceDropMinor ?? current?.minimumPriceDropMinor ?? 100,
    lastObservedAvailable: availability?.available ?? false,
    lastObservedPriceMinor: product.priceMinor,
    lastObservedAt: now,
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };
  const runtime = getProductionPostgresRuntime();
  await runtime.persistence.engagement.saveAlertPreference({ scope: customerScope(principal.userId), preference });
  return preference;
}

export async function markCustomerNotificationRead(principal: SessionPrincipal, notificationIdValue: string, now = Date.now()): Promise<void> {
  const notificationId = notificationIdValue.trim();
  if (!notificationId) throw new Error("Η ειδοποίηση είναι υποχρεωτική.");
  if (customerStateBackend() === "memory") {
    getAccountRuntime().notifications.markRead({ id: notificationId, userId: principal.userId, now });
    return;
  }
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });
  await uow.withTransaction(customerScope(principal.userId), async (tx) => {
    const result = await tx.query(`
      UPDATE notifications n
      SET read_at=COALESCE(n.read_at,$3)
      FROM users u
      WHERE n.public_id=$1
        AND n.user_id=u.id
        AND u.public_id=$2
        AND n.channel='in_app'
        AND n.archived_at IS NULL
    `, [notificationId, principal.userId, new Date(now)]);
    if (result.rowCount !== 1) throw new Error("Η ειδοποίηση δεν βρέθηκε.");
  });
}

export async function archiveCustomerNotification(principal: SessionPrincipal, notificationIdValue: string, now = Date.now()): Promise<void> {
  const notificationId = notificationIdValue.trim();
  if (!notificationId) throw new Error("Η ειδοποίηση είναι υποχρεωτική.");
  if (customerStateBackend() === "memory") {
    getAccountRuntime().notifications.archive({ id: notificationId, userId: principal.userId, now });
    return;
  }
  await getProductionPostgresRuntime().persistence.notificationOperations.archiveForUser({
    scope: customerScope(principal.userId),
    userId: principal.userId,
    notificationId,
    now
  });
}
