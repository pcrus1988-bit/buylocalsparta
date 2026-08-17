import type { EligibleOffer } from "../fairness/types.ts";

export type StockFreshnessState = "fresh" | "due_soon" | "stale";

export type StockFreshnessRule = Readonly<{
  ttlMs: number;
  reminderLeadMs: number;
}>;

export type StockFreshnessObservation = Readonly<{
  offerId: string;
  vendorId: string;
  canonicalVariantId: string;
  categoryCode: string;
  confirmedAt: number;
  expiresAt: number;
  state: StockFreshnessState;
  previousState?: StockFreshnessState;
}>;

const HOUR = 60 * 60 * 1000;

/**
 * Governs how long merchant stock confirmation can participate in search/fairness.
 * Category overrides are intentionally configurable; the defaults are conservative
 * for a local pilot and can later be replaced by Admin-controlled market settings.
 */
export class StockFreshnessPolicy {
  readonly #defaultRule: StockFreshnessRule;
  readonly #categoryRules = new Map<string, StockFreshnessRule>();

  constructor(input: { defaultTtlMs?: number; defaultReminderLeadMs?: number; categoryRules?: Readonly<Record<string, Partial<StockFreshnessRule>>> } = {}) {
    this.#defaultRule = this.#validatedRule({
      ttlMs: input.defaultTtlMs ?? 24 * HOUR,
      reminderLeadMs: input.defaultReminderLeadMs ?? 4 * HOUR
    });
    for (const [categoryCode, partial] of Object.entries(input.categoryRules ?? {})) {
      this.setCategoryRule(categoryCode, {
        ttlMs: partial.ttlMs ?? this.#defaultRule.ttlMs,
        reminderLeadMs: partial.reminderLeadMs ?? this.#defaultRule.reminderLeadMs
      });
    }
  }

  setCategoryRule(categoryCode: string, rule: StockFreshnessRule): void {
    if (!categoryCode.trim()) throw new Error("Stock freshness category code is required");
    this.#categoryRules.set(categoryCode.trim(), this.#validatedRule(rule));
  }

  ruleFor(categoryCode?: string): StockFreshnessRule {
    return structuredClone(categoryCode ? (this.#categoryRules.get(categoryCode) ?? this.#defaultRule) : this.#defaultRule);
  }

  state(input: { confirmedAt: number; categoryCode?: string; now: number; sourceEligible?: boolean }): StockFreshnessState {
    if (!Number.isFinite(input.confirmedAt) || !Number.isFinite(input.now)) throw new Error("Stock freshness timestamps must be finite");
    if (input.sourceEligible === false) return "stale";
    const rule = this.ruleFor(input.categoryCode);
    const age = Math.max(0, input.now - input.confirmedAt);
    if (age >= rule.ttlMs) return "stale";
    if (age >= Math.max(0, rule.ttlMs - rule.reminderLeadMs)) return "due_soon";
    return "fresh";
  }

  isFresh(input: { confirmedAt: number; categoryCode?: string; now: number; sourceEligible?: boolean }): boolean {
    return this.state(input) !== "stale";
  }

  applyToOffer<T extends EligibleOffer>(offer: T, now: number, categoryCode?: string): T {
    const ttlMs = offer.stockTtlMs ?? this.ruleFor(categoryCode).ttlMs;
    const state = this.state({ confirmedAt: offer.stockConfirmedAt, categoryCode, now, sourceEligible: offer.stockFresh });
    return { ...offer, stockFresh: state !== "stale", stockTtlMs: ttlMs };
  }

  #validatedRule(rule: StockFreshnessRule): StockFreshnessRule {
    if (!Number.isSafeInteger(rule.ttlMs) || rule.ttlMs <= 0) throw new Error("Stock freshness TTL must be a positive integer");
    if (!Number.isSafeInteger(rule.reminderLeadMs) || rule.reminderLeadMs < 0 || rule.reminderLeadMs > rule.ttlMs) {
      throw new Error("Stock freshness reminder lead must be between zero and the TTL");
    }
    return { ...rule };
  }
}

export class StockFreshnessMonitor {
  readonly #policy: StockFreshnessPolicy;
  readonly #entries = new Map<string, {
    offerId: string;
    vendorId: string;
    canonicalVariantId: string;
    categoryCode: string;
    confirmedAt: number;
    sourceEligible: boolean;
    lastState?: StockFreshnessState;
  }>();

  constructor(policy = new StockFreshnessPolicy()) {
    this.#policy = policy;
  }

  register(input: { offerId: string; vendorId: string; canonicalVariantId: string; categoryCode: string; confirmedAt: number; sourceEligible?: boolean }): void {
    for (const value of [input.offerId, input.vendorId, input.canonicalVariantId, input.categoryCode]) {
      if (!value.trim()) throw new Error("Stock freshness monitor requires complete offer identity");
    }
    this.#entries.set(input.offerId, {
      ...input,
      sourceEligible: input.sourceEligible ?? true,
      lastState: this.#entries.get(input.offerId)?.lastState
    });
  }

  confirm(offerId: string, now: number): StockFreshnessObservation {
    const entry = this.#required(offerId);
    const previousState = entry.lastState ?? this.#policy.state({ confirmedAt: entry.confirmedAt, categoryCode: entry.categoryCode, now, sourceEligible: entry.sourceEligible });
    entry.confirmedAt = now;
    entry.sourceEligible = true;
    const state = this.#policy.state({ confirmedAt: now, categoryCode: entry.categoryCode, now, sourceEligible: true });
    entry.lastState = state;
    return this.#observation(entry, state, previousState);
  }

  setSourceEligibility(offerId: string, eligible: boolean): void {
    this.#required(offerId).sourceEligible = eligible;
  }

  scan(now: number): readonly StockFreshnessObservation[] {
    const transitions: StockFreshnessObservation[] = [];
    for (const entry of this.#entries.values()) {
      const state = this.#policy.state({ confirmedAt: entry.confirmedAt, categoryCode: entry.categoryCode, now, sourceEligible: entry.sourceEligible });
      const previousState = entry.lastState;
      entry.lastState = state;
      if (previousState !== state) transitions.push(this.#observation(entry, state, previousState));
    }
    return structuredClone(transitions);
  }

  status(offerId: string, now: number): StockFreshnessObservation {
    const entry = this.#required(offerId);
    const state = this.#policy.state({ confirmedAt: entry.confirmedAt, categoryCode: entry.categoryCode, now, sourceEligible: entry.sourceEligible });
    return this.#observation(entry, state, entry.lastState);
  }

  all(now: number): readonly StockFreshnessObservation[] {
    return [...this.#entries.keys()].map((offerId) => this.status(offerId, now));
  }

  #observation(entry: { offerId: string; vendorId: string; canonicalVariantId: string; categoryCode: string; confirmedAt: number; sourceEligible: boolean; lastState?: StockFreshnessState }, state: StockFreshnessState, previousState?: StockFreshnessState): StockFreshnessObservation {
    const rule = this.#policy.ruleFor(entry.categoryCode);
    return {
      offerId: entry.offerId,
      vendorId: entry.vendorId,
      canonicalVariantId: entry.canonicalVariantId,
      categoryCode: entry.categoryCode,
      confirmedAt: entry.confirmedAt,
      expiresAt: entry.confirmedAt + rule.ttlMs,
      state,
      previousState
    };
  }

  #required(offerId: string) {
    const entry = this.#entries.get(offerId);
    if (!entry) throw new Error(`Unknown stock freshness offer ${offerId}`);
    return entry;
  }
}

export function offerStockIsFresh(offer: Pick<EligibleOffer, "stockFresh" | "stockConfirmedAt" | "stockTtlMs">, now: number): boolean {
  const ttlMs = offer.stockTtlMs ?? 24 * HOUR;
  return offer.stockFresh && now - offer.stockConfirmedAt <= ttlMs;
}
