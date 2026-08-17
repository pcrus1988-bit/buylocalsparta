import { id } from "../common/ids.ts";
import { money, subtractMoney, type Money } from "../common/money.ts";
import type { PlatformPriceHistoryEntry, ProductPriceResolution, ProductPromotion, ProductPromotionStatus } from "./types.ts";

const DEFAULT_PRIOR_PRICE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export class RetailPricingService {
  readonly #history: PlatformPriceHistoryEntry[] = [];
  readonly #promotions = new Map<string, ProductPromotion>();
  readonly #observedStates = new Map<string, ProductPromotionStatus>();
  readonly #priorWindowMs: number;

  constructor(priorWindowMs = DEFAULT_PRIOR_PRICE_WINDOW_MS) {
    if (!Number.isSafeInteger(priorWindowMs) || priorWindowMs <= 0) throw new Error("Prior-price window must be a positive integer duration");
    this.#priorWindowMs = priorWindowMs;
  }

  registerInitialPrice(input: { marketId: string; canonicalVariantId: string; price: Money; effectiveAt: number; actorId?: string }): PlatformPriceHistoryEntry {
    if (this.#history.some((entry) => entry.canonicalVariantId === input.canonicalVariantId)) {
      throw new Error("Initial platform price already registered for canonical product");
    }
    return this.#appendBasePrice({ ...input, actorId: input.actorId ?? "system:seed", reason: "Initial platform retail price", source: "initial", recordedAt: input.effectiveAt });
  }

  setBasePrice(input: { marketId: string; canonicalVariantId: string; price: Money; effectiveAt: number; actorId: string; reason: string; recordedAt?: number }): PlatformPriceHistoryEntry {
    if (!input.reason.trim()) throw new Error("Platform price change reason is required");
    const recordedAt = input.recordedAt ?? Date.now();
    if (input.effectiveAt < recordedAt) throw new Error("Platform price changes cannot be recorded retroactively");
    const current = this.basePriceAt(input.canonicalVariantId, input.effectiveAt);
    if (current.currency !== input.price.currency) throw new Error("Platform price currency cannot change");
    if (current.minor === input.price.minor) throw new Error("New platform price must differ from current base price");
    for (const promotion of this.#promotions.values()) {
      if (promotion.canonicalVariantId !== input.canonicalVariantId || promotion.cancelledAt !== undefined || promotion.endsAt <= input.effectiveAt) continue;
      if (promotion.promotionalPrice.currency !== input.price.currency) throw new Error("Promotional price currency mismatch");
      if (promotion.promotionalPrice.minor >= input.price.minor) {
        throw new Error("Base price would invalidate an active or scheduled price-reduction promotion");
      }
    }
    return this.#appendBasePrice({ ...input, reason: input.reason.trim(), source: "manual", recordedAt });
  }

  schedulePromotion(input: {
    id?: string;
    marketId: string;
    canonicalVariantId: string;
    name: string;
    promotionalPrice: Money;
    startsAt: number;
    endsAt: number;
    priority?: number;
    version?: number;
    reason: string;
    createdBy: string;
    createdAt: number;
  }): ProductPromotion {
    if (!input.marketId.trim() || !input.canonicalVariantId.trim()) throw new Error("Promotion market and canonical product are required");
    if (!input.name.trim() || !input.reason.trim()) throw new Error("Promotion name and reason are required");
    if (!Number.isSafeInteger(input.startsAt) || !Number.isSafeInteger(input.endsAt) || input.endsAt <= input.startsAt) throw new Error("Promotion end must be after start");
    if (!Number.isSafeInteger(input.createdAt)) throw new Error("Promotion creation time must be integer milliseconds");
    if (input.startsAt < input.createdAt) throw new Error("Promotion cannot be created retroactively");
    if (!Number.isSafeInteger(input.priority ?? 0)) throw new Error("Promotion priority must be an integer");
    if (!Number.isSafeInteger(input.version ?? 1) || (input.version ?? 1) <= 0) throw new Error("Promotion version must be positive");
    if (input.promotionalPrice.minor < 0) throw new Error("Promotional price cannot be negative");
    const baseAtStart = this.basePriceAt(input.canonicalVariantId, input.startsAt);
    if (baseAtStart.currency !== input.promotionalPrice.currency) throw new Error("Promotional price currency mismatch");
    if (input.promotionalPrice.minor >= baseAtStart.minor) throw new Error("Price-reduction promotion must be below the platform base price at promotion start");
    for (const existing of this.#promotions.values()) {
      if (existing.canonicalVariantId !== input.canonicalVariantId || existing.cancelledAt !== undefined) continue;
      if (input.startsAt < existing.endsAt && input.endsAt > existing.startsAt) throw new Error("Overlapping public price promotions are not allowed for the same canonical product");
    }
    const priorPriceSnapshot = input.startsAt <= input.createdAt ? this.lowestPriorPrice(input.canonicalVariantId, input.startsAt) : undefined;
    const record: ProductPromotion = Object.freeze({
      id: input.id ?? id("promo"), marketId: input.marketId.trim(), canonicalVariantId: input.canonicalVariantId.trim(), name: input.name.trim(),
      promotionalPrice: input.promotionalPrice, startsAt: input.startsAt, endsAt: input.endsAt, priority: input.priority ?? 0, version: input.version ?? 1,
      reason: input.reason.trim(), createdBy: input.createdBy, createdAt: input.createdAt, priorPriceSnapshot
    });
    this.#promotions.set(record.id, record);
    this.#observedStates.set(record.id, this.status(record, input.createdAt));
    return structuredClone(record);
  }

  cancelPromotion(input: { promotionId: string; actorId: string; reason: string; now: number }): ProductPromotion {
    const promotion = this.#requiredPromotion(input.promotionId);
    if (!input.reason.trim()) throw new Error("Promotion cancellation reason is required");
    if (promotion.cancelledAt !== undefined) return structuredClone(promotion);
    if (input.now >= promotion.endsAt) throw new Error("Ended promotion cannot be cancelled retroactively");
    const updated: ProductPromotion = Object.freeze({ ...promotion, cancelledAt: input.now, cancelledBy: input.actorId, cancellationReason: input.reason.trim() });
    this.#promotions.set(updated.id, updated);
    return structuredClone(updated);
  }

  synchronize(now: number): readonly { promotionId: string; canonicalVariantId: string; status: ProductPromotionStatus }[] {
    const changes: Array<{ promotionId: string; canonicalVariantId: string; status: ProductPromotionStatus }> = [];
    for (const promotionValue of this.#promotions.values()) {
      let promotion = promotionValue;
      const currentStatus = this.status(promotion, now);
      if (currentStatus === "active" && !promotion.priorPriceSnapshot) {
        promotion = Object.freeze({ ...promotion, priorPriceSnapshot: this.lowestPriorPrice(promotion.canonicalVariantId, promotion.startsAt) });
        this.#promotions.set(promotion.id, promotion);
      }
      const previousStatus = this.#observedStates.get(promotion.id);
      if (previousStatus !== currentStatus) {
        this.#observedStates.set(promotion.id, currentStatus);
        changes.push({ promotionId: promotion.id, canonicalVariantId: promotion.canonicalVariantId, status: currentStatus });
      }
    }
    return changes;
  }

  resolve(canonicalVariantId: string, now: number): ProductPriceResolution {
    const basePrice = this.basePriceAt(canonicalVariantId, now);
    const active = this.promotions({ canonicalVariantId }).filter((promotion) => this.status(promotion, now) === "active")
      .sort((a, b) => b.priority - a.priority || a.promotionalPrice.minor - b.promotionalPrice.minor || a.id.localeCompare(b.id))[0];
    if (!active) return { canonicalVariantId, basePrice, currentPrice: basePrice, source: "catalog" };
    const priorPrice = active.priorPriceSnapshot ?? this.lowestPriorPrice(canonicalVariantId, active.startsAt);
    const savings = subtractMoney(priorPrice, active.promotionalPrice);
    const reductionPercentBps = priorPrice.minor > 0 ? Math.round((savings.minor * 10_000) / priorPrice.minor) : 0;
    return {
      canonicalVariantId, basePrice, currentPrice: active.promotionalPrice, source: "promotion", promotionId: active.id, promotionName: active.name,
      priorPrice, savings, reductionPercentBps, startsAt: active.startsAt, endsAt: active.endsAt
    };
  }

  basePriceAt(canonicalVariantId: string, at: number): Money {
    const entries = this.#history.filter((entry) => entry.canonicalVariantId === canonicalVariantId && entry.effectiveAt <= at)
      .sort((a, b) => b.effectiveAt - a.effectiveAt || b.recordedAt - a.recordedAt || b.id.localeCompare(a.id));
    if (!entries.length) throw new Error(`No platform price history for ${canonicalVariantId}`);
    return entries[0].price;
  }

  lowestPriorPrice(canonicalVariantId: string, reductionStartsAt: number): Money {
    const requestedWindowStart = reductionStartsAt - this.#priorWindowMs;
    const firstKnown = this.#history.filter((entry) => entry.canonicalVariantId === canonicalVariantId && entry.effectiveAt < reductionStartsAt).sort((a, b) => a.effectiveAt - b.effectiveAt)[0];
    if (!firstKnown) throw new Error(`No platform price history for ${canonicalVariantId}`);
    const windowStart = Math.max(requestedWindowStart, firstKnown.effectiveAt);
    const changePoints = new Set<number>([windowStart]);
    for (const entry of this.#history) {
      if (entry.canonicalVariantId === canonicalVariantId && entry.effectiveAt >= windowStart && entry.effectiveAt < reductionStartsAt) changePoints.add(entry.effectiveAt);
    }
    for (const promotion of this.#promotions.values()) {
      if (promotion.canonicalVariantId !== canonicalVariantId) continue;
      if (promotion.startsAt >= windowStart && promotion.startsAt < reductionStartsAt) changePoints.add(promotion.startsAt);
      const effectiveEnd = Math.min(promotion.endsAt, promotion.cancelledAt ?? Number.POSITIVE_INFINITY);
      if (effectiveEnd >= windowStart && effectiveEnd < reductionStartsAt) changePoints.add(effectiveEnd);
    }
    const prices: Money[] = [];
    for (const point of [...changePoints].sort((a, b) => a - b)) {
      const base = this.basePriceAt(canonicalVariantId, point);
      const active = [...this.#promotions.values()].filter((promotion) => promotion.canonicalVariantId === canonicalVariantId && promotion.startsAt <= point && promotion.endsAt > point && (promotion.cancelledAt === undefined || point < promotion.cancelledAt) && promotion.startsAt < reductionStartsAt)
        .sort((a, b) => b.priority - a.priority || a.promotionalPrice.minor - b.promotionalPrice.minor)[0];
      prices.push(active?.promotionalPrice ?? base);
    }
    if (!prices.length) return this.basePriceAt(canonicalVariantId, reductionStartsAt - 1);
    return prices.reduce((lowest, price) => price.minor < lowest.minor ? price : lowest);
  }

  hasPriceHistory(canonicalVariantId: string): boolean {
    return this.#history.some((entry) => entry.canonicalVariantId === canonicalVariantId);
  }

  history(filter: { marketId?: string; canonicalVariantId?: string } = {}): readonly PlatformPriceHistoryEntry[] {
    return this.#history.filter((entry) => !filter.marketId || entry.marketId === filter.marketId)
      .filter((entry) => !filter.canonicalVariantId || entry.canonicalVariantId === filter.canonicalVariantId)
      .sort((a, b) => b.effectiveAt - a.effectiveAt || b.recordedAt - a.recordedAt)
      .map((entry) => structuredClone(entry));
  }

  promotions(filter: { marketId?: string; canonicalVariantId?: string } = {}): readonly ProductPromotion[] {
    return [...this.#promotions.values()].filter((promotion) => !filter.marketId || promotion.marketId === filter.marketId)
      .filter((promotion) => !filter.canonicalVariantId || promotion.canonicalVariantId === filter.canonicalVariantId)
      .sort((a, b) => b.createdAt - a.createdAt).map((promotion) => structuredClone(promotion));
  }

  status(promotion: ProductPromotion | string, now: number): ProductPromotionStatus {
    const record = typeof promotion === "string" ? this.#requiredPromotion(promotion) : promotion;
    if (record.cancelledAt !== undefined && now >= record.cancelledAt) return "cancelled";
    if (now < record.startsAt) return "scheduled";
    if (now >= record.endsAt) return "ended";
    return "active";
  }

  #appendBasePrice(input: { marketId: string; canonicalVariantId: string; price: Money; effectiveAt: number; recordedAt: number; actorId: string; reason: string; source: "initial" | "manual" }): PlatformPriceHistoryEntry {
    if (input.price.minor < 0) throw new Error("Platform price cannot be negative");
    if (!Number.isSafeInteger(input.effectiveAt) || !Number.isSafeInteger(input.recordedAt)) throw new Error("Platform price timestamps must be integer milliseconds");
    const entry: PlatformPriceHistoryEntry = Object.freeze({ id: id("price-history"), ...input });
    this.#history.push(entry);
    return structuredClone(entry);
  }

  #requiredPromotion(idValue: string): ProductPromotion {
    const record = this.#promotions.get(idValue);
    if (!record) throw new Error("Promotion not found");
    return record;
  }
}
