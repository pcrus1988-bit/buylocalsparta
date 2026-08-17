import { createHash } from "node:crypto";
import { id } from "../common/ids.ts";
import { normalizeSearchText } from "../search/engine.ts";
import type { AnalyticsEvent, AnalyticsEventName, MarketAnalyticsReport, SearchDemandRow, VendorAnalyticsReport } from "./types.ts";

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function assertWindow(from: number, to: number): void {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error("Invalid analytics time window");
}

/** Search analytics intentionally strips common personal identifiers before persistence/reporting. */
export function sanitizeAnalyticsSearchQuery(value: string): { query: string; normalizedQuery: string } {
  let query = value.trim().slice(0, 160);
  query = query.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  // Greek mobile / landline-looking 10-digit phone numbers. Keep 8-14 digit GTIN/EAN searches unless they look like a phone.
  query = query.replace(/(?:\+30\s*)?(?:69\d{8}|2\d{9})\b/g, "[phone]");
  return { query, normalizedQuery: normalizeSearchText(query) };
}

function hashVisitor(value: string): string {
  return createHash("sha256").update(`bls-analytics-v1|${value}`).digest("hex");
}

export class AnalyticsService {
  readonly #events = new Map<string, AnalyticsEvent>();
  readonly #dedupe = new Map<string, string>();

  record(input: {
    eventName: AnalyticsEventName;
    marketId: string;
    now: number;
    visitorKey?: string;
    customerId?: string;
    vendorId?: string;
    canonicalVariantId?: string;
    orderId?: string;
    searchEventId?: string;
    valueMinor?: number;
    quantity?: number;
    metadata?: Readonly<Record<string, unknown>>;
    dedupeKey?: string;
  }): AnalyticsEvent {
    if (!input.marketId.trim()) throw new Error("Analytics market is required");
    if (!Number.isFinite(input.now)) throw new Error("Analytics event time is required");
    if (input.valueMinor !== undefined && !Number.isSafeInteger(input.valueMinor)) throw new Error("Analytics monetary value must use integer minor units");
    if (input.quantity !== undefined && (!Number.isSafeInteger(input.quantity) || input.quantity < 0)) throw new Error("Analytics quantity must be a non-negative safe integer");
    if (input.dedupeKey) {
      const existingId = this.#dedupe.get(input.dedupeKey);
      if (existingId) return structuredClone(this.#events.get(existingId)!);
    }
    const event: AnalyticsEvent = Object.freeze({
      id: id("an"),
      eventName: input.eventName,
      marketId: input.marketId,
      occurredAt: input.now,
      visitorHash: input.visitorKey ? hashVisitor(input.visitorKey) : undefined,
      customerId: input.customerId,
      vendorId: input.vendorId,
      canonicalVariantId: input.canonicalVariantId,
      orderId: input.orderId,
      searchEventId: input.searchEventId,
      valueMinor: input.valueMinor,
      quantity: input.quantity,
      metadata: Object.freeze({ ...(input.metadata ?? {}) }),
      dedupeKey: input.dedupeKey
    });
    this.#events.set(event.id, event);
    if (input.dedupeKey) this.#dedupe.set(input.dedupeKey, event.id);
    return structuredClone(event);
  }

  recordSearch(input: {
    marketId: string;
    query: string;
    resultCount: number;
    filters?: Readonly<Record<string, unknown>>;
    visitorKey?: string;
    customerId?: string;
    now: number;
  }): AnalyticsEvent {
    if (!Number.isSafeInteger(input.resultCount) || input.resultCount < 0) throw new Error("Search result count must be a non-negative integer");
    const safe = sanitizeAnalyticsSearchQuery(input.query);
    return this.record({
      eventName: "search.performed",
      marketId: input.marketId,
      visitorKey: input.visitorKey,
      customerId: input.customerId,
      now: input.now,
      metadata: { query: safe.query, normalizedQuery: safe.normalizedQuery, resultCount: input.resultCount, filters: input.filters ?? {} }
    });
  }

  recordSearchClick(input: {
    searchEventId: string;
    entityId: string;
    entityType: "product" | "vendor" | "category" | "advice";
    position: number;
    visitorKey?: string;
    customerId?: string;
    now: number;
  }): AnalyticsEvent {
    const search = this.#events.get(input.searchEventId);
    if (!search || search.eventName !== "search.performed") throw new Error("Search analytics event not found");
    if (!Number.isSafeInteger(input.position) || input.position < 0) throw new Error("Search click position must be a non-negative integer");
    const visitorHash = input.visitorKey ? hashVisitor(input.visitorKey) : undefined;
    const sameVisitor = Boolean(visitorHash && search.visitorHash && visitorHash === search.visitorHash);
    const sameCustomer = Boolean(input.customerId && search.customerId && input.customerId === search.customerId);
    if ((search.visitorHash || search.customerId) && !sameVisitor && !sameCustomer) throw new Error("Search analytics attribution mismatch");
    return this.record({
      eventName: "search.result_clicked",
      marketId: search.marketId,
      visitorKey: input.visitorKey,
      customerId: input.customerId,
      searchEventId: search.id,
      canonicalVariantId: input.entityType === "product" ? input.entityId : undefined,
      now: input.now,
      metadata: { entityId: input.entityId, entityType: input.entityType, position: input.position },
      dedupeKey: `search-click:${search.id}:${input.entityType}:${input.entityId}`
    });
  }

  events(input: { marketId?: string; vendorId?: string; from?: number; to?: number; eventName?: AnalyticsEventName } = {}): readonly AnalyticsEvent[] {
    return [...this.#events.values()]
      .filter((event) => !input.marketId || event.marketId === input.marketId)
      .filter((event) => !input.vendorId || event.vendorId === input.vendorId)
      .filter((event) => input.from === undefined || event.occurredAt >= input.from)
      .filter((event) => input.to === undefined || event.occurredAt <= input.to)
      .filter((event) => !input.eventName || event.eventName === input.eventName)
      .sort((a, b) => a.occurredAt - b.occurredAt)
      .map((event) => structuredClone(event));
  }

  purgeBefore(cutoff: number): number {
    if (!Number.isFinite(cutoff)) throw new Error("Analytics retention cutoff must be finite");
    let removed = 0;
    for (const [eventId, event] of this.#events) {
      if (event.occurredAt >= cutoff) continue;
      this.#events.delete(eventId);
      if (event.dedupeKey && this.#dedupe.get(event.dedupeKey) === eventId) this.#dedupe.delete(event.dedupeKey);
      removed += 1;
    }
    return removed;
  }

  marketReport(input: { marketId: string; from: number; to: number; topLimit?: number }): MarketAnalyticsReport {
    assertWindow(input.from, input.to);
    const events = this.events({ marketId: input.marketId, from: input.from, to: input.to });
    const searches = events.filter((event) => event.eventName === "search.performed");
    const clicks = events.filter((event) => event.eventName === "search.result_clicked");
    const demand = new Map<string, { query: string; normalizedQuery: string; searches: number; zeroResults: number; clicks: number; resultCountTotal: number }>();
    for (const event of searches) {
      const normalizedQuery = String(event.metadata.normalizedQuery ?? "");
      const query = String(event.metadata.query ?? "");
      if (!normalizedQuery) continue;
      const row = demand.get(normalizedQuery) ?? { query, normalizedQuery, searches: 0, zeroResults: 0, clicks: 0, resultCountTotal: 0 };
      row.searches += 1;
      const resultCount = Number(event.metadata.resultCount ?? 0);
      row.resultCountTotal += Number.isFinite(resultCount) ? resultCount : 0;
      if (resultCount === 0) row.zeroResults += 1;
      demand.set(normalizedQuery, row);
    }
    const searchToQuery = new Map(searches.map((event) => [event.id, String(event.metadata.normalizedQuery ?? "")] as const));
    const clickedSearchesByQuery = new Map<string, Set<string>>();
    const clickedSearchIds = new Set<string>();
    for (const click of clicks) {
      if (!click.searchEventId) continue;
      clickedSearchIds.add(click.searchEventId);
      const key = searchToQuery.get(click.searchEventId);
      if (key && demand.has(key)) {
        demand.get(key)!.clicks += 1;
        const ids = clickedSearchesByQuery.get(key) ?? new Set<string>();
        ids.add(click.searchEventId);
        clickedSearchesByQuery.set(key, ids);
      }
    }
    const rows: SearchDemandRow[] = [...demand.values()].map((row) => Object.freeze({
      ...row,
      successRate: rate(row.searches - row.zeroResults, row.searches),
      clickThroughRate: rate(clickedSearchesByQuery.get(row.normalizedQuery)?.size ?? 0, row.searches)
    }));
    const topLimit = Math.min(50, Math.max(1, input.topLimit ?? 10));
    const topQueries = rows.slice().sort((a, b) => b.searches - a.searches || b.clicks - a.clicks || a.query.localeCompare(b.query, "el")).slice(0, topLimit);
    const topZeroResultQueries = rows.filter((row) => row.zeroResults > 0).sort((a, b) => b.zeroResults - a.zeroResults || b.searches - a.searches).slice(0, topLimit);

    const category = new Map<string, { searches: number; productViews: number; cartAdds: number }>();
    for (const event of events) {
      const filters = event.eventName === "search.performed" && event.metadata.filters && typeof event.metadata.filters === "object" ? event.metadata.filters as Record<string, unknown> : undefined;
      const code = String(event.metadata.categoryCode ?? filters?.categoryCode ?? "");
      if (!code) continue;
      const row = category.get(code) ?? { searches: 0, productViews: 0, cartAdds: 0 };
      if (event.eventName === "search.performed") row.searches += 1;
      if (event.eventName === "product.viewed") row.productViews += 1;
      if (event.eventName === "cart.item_added") row.cartAdds += 1;
      category.set(code, row);
    }

    const successfulSearches = searches.filter((event) => Number(event.metadata.resultCount ?? 0) > 0).length;
    const orders = events.filter((event) => event.eventName === "checkout.authorised");
    const uniqueOrders = new Map(orders.filter((event) => event.orderId).map((event) => [event.orderId!, event]));
    const acceptedCounteroffers = events.filter((event) => event.eventName === "counteroffer.accepted").length;
    const counterofferRequests = events.filter((event) => event.eventName === "counteroffer.requested").length;
    const gmvMinor = [...uniqueOrders.values()].reduce((sum, event) => sum + (event.valueMinor ?? 0), 0);
    return Object.freeze({
      marketId: input.marketId,
      from: input.from,
      to: input.to,
      searches: searches.length,
      successfulSearches,
      zeroResultSearches: searches.length - successfulSearches,
      searchSuccessRate: rate(successfulSearches, searches.length),
      searchClickThroughRate: rate(clickedSearchIds.size, searches.length),
      productImpressions: events.filter((event) => event.eventName === "product.impression").length,
      productViews: events.filter((event) => event.eventName === "product.viewed").length,
      cartAdds: events.filter((event) => event.eventName === "cart.item_added").length,
      authorisedOrders: uniqueOrders.size,
      gmvMinor,
      averageOrderValueMinor: uniqueOrders.size ? Math.round(gmvMinor / uniqueOrders.size) : 0,
      adviceStarts: events.filter((event) => event.eventName === "advice.started").length,
      appointmentsBooked: events.filter((event) => event.eventName === "appointment.booked").length,
      counterofferRequests,
      counterofferOffers: events.filter((event) => event.eventName === "counteroffer.offer_sent").length,
      counterofferAccepted: acceptedCounteroffers,
      counterofferConversionRate: rate(acceptedCounteroffers, counterofferRequests),
      topQueries,
      topZeroResultQueries,
      categoryDemand: [...category.entries()].map(([categoryCode, values]) => ({ categoryCode, ...values })).sort((a, b) => (b.searches + b.productViews + b.cartAdds) - (a.searches + a.productViews + a.cartAdds))
    });
  }

  vendorReport(input: { marketId: string; vendorId: string; from: number; to: number }): VendorAnalyticsReport {
    assertWindow(input.from, input.to);
    const events = this.events({ marketId: input.marketId, vendorId: input.vendorId, from: input.from, to: input.to });
    const orders = events.filter((event) => event.eventName === "order.vendor_attributed");
    const uniqueOrders = new Map(orders.filter((event) => event.orderId).map((event) => [event.orderId!, event]));
    return Object.freeze({
      marketId: input.marketId,
      vendorId: input.vendorId,
      from: input.from,
      to: input.to,
      qualifiedImpressions: events.filter((event) => event.eventName === "product.impression").length,
      productViews: events.filter((event) => event.eventName === "product.viewed").length,
      cartAdds: events.filter((event) => event.eventName === "cart.item_added").length,
      attributedOrders: uniqueOrders.size,
      attributedUnits: orders.reduce((sum, event) => sum + (event.quantity ?? 0), 0),
      attributedRetailSalesMinor: orders.reduce((sum, event) => sum + (event.valueMinor ?? 0), 0),
      adviceStarts: events.filter((event) => event.eventName === "advice.started").length,
      appointmentsBooked: events.filter((event) => event.eventName === "appointment.booked").length,
      counterofferRequests: events.filter((event) => event.eventName === "counteroffer.requested").length,
      counterofferOffers: events.filter((event) => event.eventName === "counteroffer.offer_sent").length,
      counterofferAccepted: events.filter((event) => event.eventName === "counteroffer.accepted").length
    });
  }
}
