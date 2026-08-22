import { id, type SavedProductAlertPreference, type SessionPrincipal } from "@buy-local-sparta/core";
import { customerScope } from "@buy-local-sparta/postgres-runtime";
import { getAccountRuntime } from "./account-runtime";
import { getCanonicalAvailability, getCanonicalProductSummary } from "./catalog-view";
import { customerStateBackend, customerStateSnapshot } from "./customer-state-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export async function configureCustomerSavedProductAlert(
  principal: SessionPrincipal,
  input: {
    canonicalVariantId: string;
    backInStockEnabled?: boolean;
    priceDropEnabled?: boolean;
    minimumPriceDropMinor?: number;
    now?: number;
  }
): Promise<SavedProductAlertPreference> {
  const canonicalVariantId = input.canonicalVariantId.trim();
  if (!canonicalVariantId) throw new Error("Το αποθηκευμένο προϊόν είναι υποχρεωτικό.");
  const now = input.now ?? Date.now();
  if (input.minimumPriceDropMinor !== undefined && (!Number.isSafeInteger(input.minimumPriceDropMinor) || input.minimumPriceDropMinor < 0 || input.minimumPriceDropMinor > 100_000_000)) {
    throw new Error("Μη έγκυρο όριο πτώσης τιμής.");
  }

  const snapshot = await customerStateSnapshot(principal.userId, now);
  if (!snapshot.savedProducts.some((item) => item.canonicalVariantId === canonicalVariantId)) {
    throw new Error("Το προϊόν δεν βρίσκεται στα αποθηκευμένα σου.");
  }

  const [product, availability] = await Promise.all([
    getCanonicalProductSummary(canonicalVariantId),
    getCanonicalAvailability(canonicalVariantId)
  ]);
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
  await getProductionPostgresRuntime().persistence.engagement.saveAlertPreference({
    scope: customerScope(principal.userId),
    preference
  });
  return preference;
}
