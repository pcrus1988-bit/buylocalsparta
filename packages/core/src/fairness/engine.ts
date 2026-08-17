import { createHash } from "node:crypto";
import type { Assignment, AssignmentContext, EligibleOffer, EligibilityDecision, EligibilityReason } from "./types.ts";

export type FairnessEngineOptions = Readonly<{
  qualifiedViewStickyMs?: number;
  adviceStickyMs?: number;
  counterofferCoolingMs?: number;
  warmStartCredit?: number;
}>;

type StickyRecord = Readonly<{
  offerId: string;
  vendorId: string;
  locationId: string;
  expiresAt: number;
}>;

type PoolState = {
  deficits: Map<string, number>;
  exposures: Map<string, number>;
  selections: number;
};

export class FairVendorExposureEngine {
  readonly #options: Required<FairnessEngineOptions>;
  readonly #pools = new Map<string, PoolState>();
  readonly #sticky = new Map<string, StickyRecord>();
  readonly #events: Assignment[] = [];

  constructor(options: FairnessEngineOptions = {}) {
    this.#options = {
      qualifiedViewStickyMs: options.qualifiedViewStickyMs ?? 7 * 24 * 60 * 60 * 1000,
      adviceStickyMs: options.adviceStickyMs ?? 30 * 24 * 60 * 60 * 1000,
      counterofferCoolingMs: options.counterofferCoolingMs ?? 24 * 60 * 60 * 1000,
      warmStartCredit: options.warmStartCredit ?? 0.25
    };
  }

  select(context: AssignmentContext, offers: readonly EligibleOffer[]): Assignment {
    const decisions = new Map(offers.map((offer) => [offer.offerId, this.evaluateEligibility(offer)] as const));
    const eligible = offers.filter((offer) => decisions.get(offer.offerId)?.eligible);
    if (eligible.length === 0) throw new Error("No eligible vendor offer for canonical variant");
    const eligibilityByOffer = Object.fromEntries(decisions);

    const stickyKey = this.#stickyKey(context);
    const sticky = this.#sticky.get(stickyKey);
    if (sticky && sticky.expiresAt > context.now) {
      const existing = eligible.find((offer) => offer.offerId === sticky.offerId);
      if (existing) {
        return {
          offerId: existing.offerId,
          vendorId: existing.vendorId,
          locationId: existing.locationId,
          canonicalVariantId: context.canonicalVariantId,
          selectedAt: context.now,
          stickyUntil: sticky.expiresAt,
          reusedStickyAssignment: true,
          reason: "Existing sticky assignment remains eligible",
          eligibleVendorIds: [...new Set(eligible.map((o) => o.vendorId))],
          deficitsAfterSelection: this.snapshotDeficits(context),
          eligibilityByOffer
        };
      }
      this.#sticky.delete(stickyKey);
    }

    const pool = this.#pool(context);
    const existingDeficits = [...pool.deficits.values()];
    const warmBaseline = existingDeficits.length === 0 ? 0 : Math.max(...existingDeficits);
    const vendorOffers = this.#groupByVendor(eligible);

    for (const vendorId of vendorOffers.keys()) {
      if (!pool.deficits.has(vendorId)) {
        pool.deficits.set(vendorId, warmBaseline + this.#options.warmStartCredit);
        pool.exposures.set(vendorId, 0);
      }
    }

    const vendorWeights = new Map([...vendorOffers.entries()].map(([vendorId, offersForVendor]) => [vendorId, Math.max(...offersForVendor.map((offer) => this.#weight(offer)))]));
    const totalWeight = [...vendorWeights.values()].reduce((sum, weight) => sum + weight, 0);
    for (const [vendorId, weight] of vendorWeights) {
      const current = pool.deficits.get(vendorId) ?? 0;
      pool.deficits.set(vendorId, current + weight / totalWeight);
    }

    // A merchant with several branches must not receive several fairness tickets.
    // First choose one best eligible location/offer per merchant, then rotate merchants.
    const representatives = [...vendorOffers.values()].map((offersForVendor) => [...offersForVendor].sort((a, b) => this.#compareLocations(context, a, b))[0]);
    const sorted = representatives.sort((a, b) => this.#compareCandidates(context, pool, a, b));
    const selected = sorted[0];
    pool.deficits.set(selected.vendorId, (pool.deficits.get(selected.vendorId) ?? 0) - 1);
    pool.exposures.set(selected.vendorId, (pool.exposures.get(selected.vendorId) ?? 0) + 1);
    pool.selections += 1;

    const stickyUntil = context.now + this.#stickyDuration(context.reason);
    this.#sticky.set(stickyKey, {
      offerId: selected.offerId,
      vendorId: selected.vendorId,
      locationId: selected.locationId,
      expiresAt: stickyUntil
    });

    const event: Assignment = {
      offerId: selected.offerId,
      vendorId: selected.vendorId,
      locationId: selected.locationId,
      canonicalVariantId: context.canonicalVariantId,
      selectedAt: context.now,
      stickyUntil,
      reusedStickyAssignment: false,
      reason: "Highest availability-adjusted fairness deficit after eligibility gate",
      eligibleVendorIds: [...new Set(eligible.map((o) => o.vendorId))],
      deficitsAfterSelection: Object.fromEntries([...pool.deficits.entries()]),
      eligibilityByOffer
    };
    this.#events.push(event);
    return event;
  }

  evaluateEligibility(offer: EligibleOffer): EligibilityDecision {
    const reasons: EligibilityReason[] = [];
    if (!offer.approved) reasons.push("offer_not_approved");
    if (!offer.vendorActive) reasons.push("vendor_inactive");
    if (!offer.locationActive) reasons.push("location_inactive");
    if (!offer.productAllowed) reasons.push("product_not_allowed");
    if (offer.availableToSell <= 0) reasons.push("out_of_stock");
    if (!offer.stockFresh) reasons.push("stock_stale");
    if (!offer.canServe) reasons.push("cannot_serve_context");
    if (!offer.costWithinCeiling) reasons.push("cost_above_ceiling");
    if (!offer.capacityOpen) reasons.push("capacity_closed");
    return { eligible: reasons.length === 0, reasons };
  }

  isEligible(offer: EligibleOffer): boolean {
    return this.evaluateEligibility(offer).eligible;
  }

  releaseSticky(context: Pick<AssignmentContext, "marketId" | "canonicalVariantId" | "visitorKey" | "postcode">): void {
    this.#sticky.delete(`${context.marketId}:${context.canonicalVariantId}:${context.visitorKey}:${context.postcode}`);
  }

  snapshot(context: Pick<AssignmentContext, "marketId" | "canonicalVariantId">) {
    const pool = this.#pools.get(this.#poolKey(context.marketId, context.canonicalVariantId));
    return {
      selections: pool?.selections ?? 0,
      deficits: pool ? Object.fromEntries(pool.deficits) : {},
      exposures: pool ? Object.fromEntries(pool.exposures) : {}
    };
  }

  events(): readonly Assignment[] {
    return this.#events;
  }

  private snapshotDeficits(context: Pick<AssignmentContext, "marketId" | "canonicalVariantId">): Record<string, number> {
    return this.snapshot(context).deficits;
  }

  #pool(context: Pick<AssignmentContext, "marketId" | "canonicalVariantId">): PoolState {
    const key = this.#poolKey(context.marketId, context.canonicalVariantId);
    let pool = this.#pools.get(key);
    if (!pool) {
      pool = { deficits: new Map(), exposures: new Map(), selections: 0 };
      this.#pools.set(key, pool);
    }
    return pool;
  }

  #poolKey(marketId: string, canonicalVariantId: string): string {
    return `${marketId}:${canonicalVariantId}`;
  }

  #stickyKey(context: Pick<AssignmentContext, "marketId" | "canonicalVariantId" | "visitorKey" | "postcode">): string {
    return `${context.marketId}:${context.canonicalVariantId}:${context.visitorKey}:${context.postcode}`;
  }


  #groupByVendor(offers: readonly EligibleOffer[]): Map<string, EligibleOffer[]> {
    const grouped = new Map<string, EligibleOffer[]>();
    for (const offer of offers) {
      const list = grouped.get(offer.vendorId) ?? [];
      list.push(offer);
      grouped.set(offer.vendorId, list);
    }
    return grouped;
  }

  #compareLocations(context: AssignmentContext, a: EligibleOffer, b: EligibleOffer): number {
    const fulfilmentDiff = a.fulfilmentFit - b.fulfilmentFit;
    if (fulfilmentDiff !== 0) return fulfilmentDiff;
    const freshnessDiff = b.stockConfirmedAt - a.stockConfirmedAt;
    if (freshnessDiff !== 0) return freshnessDiff;
    return this.#offerTieHash(context, a).localeCompare(this.#offerTieHash(context, b));
  }

  #offerTieHash(context: AssignmentContext, offer: EligibleOffer): string {
    const epoch = Math.floor(context.now / (24 * 60 * 60 * 1000));
    return createHash("sha256").update(`${context.canonicalVariantId}|${context.postcode}|${epoch}|${offer.vendorId}|${offer.locationId}|${offer.offerId}`).digest("hex");
  }

  #weight(offer: EligibleOffer): number {
    const weight = offer.capacityWeight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) throw new Error("capacityWeight must be > 0");
    return weight;
  }

  #stickyDuration(reason: AssignmentContext["reason"]): number {
    if (reason === "chat" || reason === "appointment") return this.#options.adviceStickyMs;
    if (reason === "counteroffer") return this.#options.adviceStickyMs + this.#options.counterofferCoolingMs;
    if (reason === "add_to_cart" || reason === "checkout") return this.#options.adviceStickyMs;
    return this.#options.qualifiedViewStickyMs;
  }

  #compareCandidates(context: AssignmentContext, pool: PoolState, a: EligibleOffer, b: EligibleOffer): number {
    const deficitDiff = (pool.deficits.get(b.vendorId) ?? 0) - (pool.deficits.get(a.vendorId) ?? 0);
    if (Math.abs(deficitDiff) > 1e-12) return deficitDiff;

    const fulfilmentDiff = a.fulfilmentFit - b.fulfilmentFit;
    if (fulfilmentDiff !== 0) return fulfilmentDiff;

    const freshnessDiff = b.stockConfirmedAt - a.stockConfirmedAt;
    if (freshnessDiff !== 0) return freshnessDiff;

    const ah = this.#tieHash(context, a.vendorId);
    const bh = this.#tieHash(context, b.vendorId);
    return ah.localeCompare(bh);
  }

  #tieHash(context: AssignmentContext, vendorId: string): string {
    const epoch = Math.floor(context.now / (24 * 60 * 60 * 1000));
    return createHash("sha256")
      .update(`${context.canonicalVariantId}|${context.postcode}|${epoch}|${vendorId}`)
      .digest("hex");
  }
}
