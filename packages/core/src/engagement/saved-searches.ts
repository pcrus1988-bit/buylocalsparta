import { id } from "../common/ids.ts";
import type { SavedSearch, SavedSearchAlertEvent, SavedSearchQuery } from "./types.ts";

function validateMinor(value: number | undefined, label: string): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must use non-negative integer minor units`);
}

export function normalizeSavedSearchQuery(query: SavedSearchQuery): SavedSearchQuery {
  validateMinor(query.minPriceMinor, "Minimum saved-search price");
  validateMinor(query.maxPriceMinor, "Maximum saved-search price");
  if (query.minPriceMinor !== undefined && query.maxPriceMinor !== undefined && query.minPriceMinor > query.maxPriceMinor) {
    throw new Error("Saved-search minimum price cannot exceed maximum price");
  }
  const q = query.q.trim().replace(/\s+/g, " ").slice(0, 160);
  const categoryCode = query.categoryCode?.trim().slice(0, 100) || undefined;
  const attributeFilters: Record<string, string | readonly string[]> = {};
  for (const [rawCode, rawValue] of Object.entries(query.attributeFilters ?? {}).slice(0, 20)) {
    const code = rawCode.trim().slice(0, 80);
    if (!code) continue;
    if (Array.isArray(rawValue)) {
      const values = rawValue.map((value) => String(value).trim().slice(0, 120)).filter(Boolean).slice(0, 12);
      if (values.length) attributeFilters[code] = values;
    } else {
      const value = String(rawValue).trim().slice(0, 120);
      if (value) attributeFilters[code] = value;
    }
  }
  if (!q && !categoryCode && !query.adviceOnly && query.minPriceMinor === undefined && query.maxPriceMinor === undefined && !Object.keys(attributeFilters).length && (!query.availability || query.availability === "any")) {
    throw new Error("Saved search requires at least one search term or filter");
  }
  return Object.freeze({
    q,
    availability: query.availability ?? "any",
    adviceOnly: Boolean(query.adviceOnly),
    minPriceMinor: query.minPriceMinor,
    maxPriceMinor: query.maxPriceMinor,
    categoryCode,
    attributeFilters: Object.keys(attributeFilters).length ? Object.freeze(attributeFilters) : undefined
  });
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 500);
}

export class SavedSearchService {
  readonly #searches = new Map<string, SavedSearch>();
  readonly #events: SavedSearchAlertEvent[] = [];

  create(input: {
    userId: string;
    marketId: string;
    name?: string;
    query: SavedSearchQuery;
    alertsEnabled?: boolean;
    currentCanonicalVariantIds: readonly string[];
    now: number;
  }): SavedSearch {
    if (!input.userId.trim() || !input.marketId.trim()) throw new Error("Saved search requires user and market");
    const query = normalizeSavedSearchQuery(input.query);
    const defaultName = query.q || query.categoryCode || "Saved local search";
    const item: SavedSearch = Object.freeze({
      id: id("saved-search"),
      userId: input.userId,
      marketId: input.marketId,
      name: (input.name?.trim() || defaultName).slice(0, 100),
      query,
      alertsEnabled: input.alertsEnabled ?? true,
      seenCanonicalVariantIds: Object.freeze(uniqueIds(input.currentCanonicalVariantIds)),
      lastObservedCount: uniqueIds(input.currentCanonicalVariantIds).length,
      lastObservedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now
    });
    this.#searches.set(item.id, item);
    return structuredClone(item);
  }

  get(searchId: string): SavedSearch | undefined {
    const item = this.#searches.get(searchId);
    return item ? structuredClone(item) : undefined;
  }

  forUser(userId: string): readonly SavedSearch[] {
    return structuredClone([...this.#searches.values()].filter((item) => item.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt));
  }

  active(): readonly SavedSearch[] {
    return structuredClone([...this.#searches.values()].filter((item) => item.alertsEnabled).sort((a, b) => a.createdAt - b.createdAt));
  }

  configure(input: { searchId: string; userId: string; alertsEnabled: boolean; currentCanonicalVariantIds: readonly string[]; now: number }): SavedSearch {
    const current = this.#required(input.searchId);
    if (current.userId !== input.userId) throw new Error("Saved-search ownership violation");
    const baseline = uniqueIds(input.currentCanonicalVariantIds);
    const next: SavedSearch = Object.freeze({
      ...current,
      alertsEnabled: input.alertsEnabled,
      // Re-baseline on preference change. Enabling alerts should not fire historical matches.
      seenCanonicalVariantIds: Object.freeze([...new Set([...current.seenCanonicalVariantIds, ...baseline])].slice(-500)),
      lastObservedCount: baseline.length,
      lastObservedAt: input.now,
      updatedAt: input.now
    });
    this.#searches.set(current.id, next);
    return structuredClone(next);
  }

  update(input: { searchId: string; userId: string; name: string; query: SavedSearchQuery; currentCanonicalVariantIds: readonly string[]; now: number }): SavedSearch {
    const current = this.#required(input.searchId);
    if (current.userId !== input.userId) throw new Error("Saved-search ownership violation");
    const name = input.name.trim().replace(/\s+/g, " ").slice(0, 100);
    if (!name) throw new Error("Saved-search name is required");
    const query = normalizeSavedSearchQuery(input.query);
    const baseline = uniqueIds(input.currentCanonicalVariantIds);
    const next: SavedSearch = Object.freeze({
      ...current,
      name,
      query,
      // Editing criteria establishes a fresh observation baseline. Existing results are not new alerts.
      seenCanonicalVariantIds: Object.freeze(baseline),
      lastObservedCount: baseline.length,
      lastObservedAt: input.now,
      updatedAt: input.now
    });
    this.#searches.set(current.id, next);
    return structuredClone(next);
  }

  remove(input: { searchId: string; userId: string }): boolean {
    const current = this.#searches.get(input.searchId);
    if (!current) return false;
    if (current.userId !== input.userId) throw new Error("Saved-search ownership violation");
    this.#searches.delete(current.id);
    for (let index = this.#events.length - 1; index >= 0; index -= 1) if (this.#events[index].savedSearchId === current.id) this.#events.splice(index, 1);
    return true;
  }

  clearUser(userId: string): number {
    let removed = 0;
    for (const [searchId, item] of this.#searches) if (item.userId === userId) { this.#searches.delete(searchId); removed += 1; }
    for (let index = this.#events.length - 1; index >= 0; index -= 1) if (this.#events[index].userId === userId) this.#events.splice(index, 1);
    return removed;
  }

  reconcile(input: { searchId: string; currentCanonicalVariantIds: readonly string[]; now: number }): readonly SavedSearchAlertEvent[] {
    const current = this.#required(input.searchId);
    const currentIds = uniqueIds(input.currentCanonicalVariantIds);
    const seen = new Set(current.seenCanonicalVariantIds);
    const emitted: SavedSearchAlertEvent[] = [];
    if (current.alertsEnabled) {
      for (const canonicalVariantId of currentIds) {
        if (seen.has(canonicalVariantId) || this.#events.some((event) => event.savedSearchId === current.id && event.canonicalVariantId === canonicalVariantId)) continue;
        const event: SavedSearchAlertEvent = Object.freeze({
          id: id("saved-search-event"), savedSearchId: current.id, userId: current.userId,
          canonicalVariantId, type: "new_match", createdAt: input.now
        });
        this.#events.push(event);
        emitted.push(event);
      }
    }
    const nextSeen = [...seen];
    for (const canonicalVariantId of currentIds) if (!seen.has(canonicalVariantId)) nextSeen.push(canonicalVariantId);
    const next: SavedSearch = Object.freeze({ ...current, seenCanonicalVariantIds: Object.freeze(nextSeen.slice(-500)), lastObservedCount: currentIds.length, lastObservedAt: input.now, updatedAt: input.now });
    this.#searches.set(current.id, next);
    return structuredClone(emitted);
  }

  eventsForUser(userId: string): readonly SavedSearchAlertEvent[] {
    return structuredClone(this.#events.filter((event) => event.userId === userId).sort((a, b) => b.createdAt - a.createdAt));
  }

  #required(searchId: string): SavedSearch {
    const item = this.#searches.get(searchId);
    if (!item) throw new Error("Saved search not found");
    return item;
  }
}
