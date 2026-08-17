import { id } from "../common/ids.ts";
import type {
  SavedProductAlertEvent,
  SavedProductAlertPreference
} from "./types.ts";

function key(userId: string, canonicalVariantId: string): string {
  return `${userId}:${canonicalVariantId}`;
}

export class SavedProductAlertService {
  readonly #preferences = new Map<string, SavedProductAlertPreference>();
  readonly #events: SavedProductAlertEvent[] = [];

  configure(input: {
    userId: string;
    canonicalVariantId: string;
    backInStockEnabled?: boolean;
    priceDropEnabled?: boolean;
    minimumPriceDropMinor?: number;
    currentAvailable: boolean;
    currentPriceMinor: number;
    now: number;
  }): SavedProductAlertPreference {
    if (!input.userId.trim() || !input.canonicalVariantId.trim()) throw new Error("Saved-product alert requires user and canonical product");
    if (!Number.isSafeInteger(input.currentPriceMinor) || input.currentPriceMinor < 0) throw new Error("Saved-product alert price must use non-negative integer minor units");
    const minimumPriceDropMinor = input.minimumPriceDropMinor ?? this.#preferences.get(key(input.userId, input.canonicalVariantId))?.minimumPriceDropMinor ?? 100;
    if (!Number.isSafeInteger(minimumPriceDropMinor) || minimumPriceDropMinor < 0) throw new Error("Minimum price drop must use non-negative integer minor units");
    const current = this.#preferences.get(key(input.userId, input.canonicalVariantId));
    const next: SavedProductAlertPreference = Object.freeze({
      id: current?.id ?? id("saved-alert"),
      userId: input.userId,
      canonicalVariantId: input.canonicalVariantId,
      backInStockEnabled: input.backInStockEnabled ?? current?.backInStockEnabled ?? false,
      priceDropEnabled: input.priceDropEnabled ?? current?.priceDropEnabled ?? false,
      minimumPriceDropMinor,
      // Re-baseline when the customer changes alert settings so enabling an alert never
      // immediately emits a notification about a state that already existed.
      lastObservedAvailable: input.currentAvailable,
      lastObservedPriceMinor: input.currentPriceMinor,
      lastObservedAt: input.now,
      createdAt: current?.createdAt ?? input.now,
      updatedAt: input.now
    });
    this.#preferences.set(key(input.userId, input.canonicalVariantId), next);
    return structuredClone(next);
  }

  preference(userId: string, canonicalVariantId: string): SavedProductAlertPreference | undefined {
    const item = this.#preferences.get(key(userId, canonicalVariantId));
    return item ? structuredClone(item) : undefined;
  }

  forUser(userId: string): readonly SavedProductAlertPreference[] {
    return structuredClone([...this.#preferences.values()].filter((item) => item.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt));
  }

  productIds(): readonly string[] {
    return [...new Set([...this.#preferences.values()].filter((item) => item.backInStockEnabled || item.priceDropEnabled).map((item) => item.canonicalVariantId))].sort();
  }

  remove(userId: string, canonicalVariantId: string): boolean {
    const current = this.#preferences.get(key(userId, canonicalVariantId));
    if (!current) return false;
    this.#preferences.delete(key(userId, canonicalVariantId));
    for (let index = this.#events.length - 1; index >= 0; index -= 1) {
      if (this.#events[index].preferenceId === current.id) this.#events.splice(index, 1);
    }
    return true;
  }

  clearUser(userId: string): number {
    let removed = 0;
    for (const [entryKey, item] of this.#preferences) {
      if (item.userId !== userId) continue;
      this.#preferences.delete(entryKey);
      removed += 1;
    }
    for (let index = this.#events.length - 1; index >= 0; index -= 1) {
      if (this.#events[index].userId === userId) this.#events.splice(index, 1);
    }
    return removed;
  }

  reconcileProduct(input: { canonicalVariantId: string; available: boolean; priceMinor: number; now: number }): readonly SavedProductAlertEvent[] {
    if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0) throw new Error("Saved-product alert price must use non-negative integer minor units");
    const emitted: SavedProductAlertEvent[] = [];
    for (const [entryKey, current] of this.#preferences) {
      if (current.canonicalVariantId !== input.canonicalVariantId) continue;
      if (current.backInStockEnabled && !current.lastObservedAvailable && input.available) {
        const event: SavedProductAlertEvent = Object.freeze({
          id: id("saved-alert-event"), preferenceId: current.id, userId: current.userId, canonicalVariantId: current.canonicalVariantId,
          type: "back_in_stock", previousAvailable: current.lastObservedAvailable, available: input.available, createdAt: input.now
        });
        this.#events.push(event); emitted.push(event);
      }
      const drop = current.lastObservedPriceMinor - input.priceMinor;
      if (current.priceDropEnabled && drop > 0 && drop >= current.minimumPriceDropMinor) {
        const event: SavedProductAlertEvent = Object.freeze({
          id: id("saved-alert-event"), preferenceId: current.id, userId: current.userId, canonicalVariantId: current.canonicalVariantId,
          type: "price_drop", previousPriceMinor: current.lastObservedPriceMinor, priceMinor: input.priceMinor, priceDropMinor: drop, createdAt: input.now
        });
        this.#events.push(event); emitted.push(event);
      }
      const next: SavedProductAlertPreference = Object.freeze({ ...current, lastObservedAvailable: input.available, lastObservedPriceMinor: input.priceMinor, lastObservedAt: input.now });
      this.#preferences.set(entryKey, next);
    }
    return structuredClone(emitted);
  }

  eventsForUser(userId: string): readonly SavedProductAlertEvent[] {
    return structuredClone(this.#events.filter((event) => event.userId === userId).sort((a, b) => b.createdAt - a.createdAt));
  }
}
