import { normalizeSavedSearchQuery, type SavedSearch, type SavedSearchQuery, type SessionPrincipal } from "@buy-local-sparta/core";
import { customerScope } from "@buy-local-sparta/postgres-runtime";
import { currentSavedSearchMatches, getAccountRuntime } from "./account-runtime";
import { customerStateBackend } from "./customer-state-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

async function currentMatches(query: SavedSearchQuery): Promise<readonly string[]> {
  return currentSavedSearchMatches({
    q: query.q,
    categoryCode: query.categoryCode,
    availability: query.availability ?? "any"
  });
}

function normalizedName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!name) throw new Error("Το όνομα της αναζήτησης είναι υποχρεωτικό.");
  return name;
}

export async function configureCustomerSavedSearchAlerts(
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
    const currentCanonicalVariantIds = await currentMatches(current.query);
    return runtime.savedSearches.configure({
      searchId,
      userId: principal.userId,
      alertsEnabled: input.alertsEnabled,
      currentCanonicalVariantIds,
      now
    });
  }

  const runtime = getProductionPostgresRuntime();
  const scope = customerScope(principal.userId);
  const searches = await runtime.persistence.engagement.listSavedSearches({ scope, userId: principal.userId });
  const current = searches.find((item) => item.id === searchId);
  if (!current) throw new Error("Η αποθηκευμένη αναζήτηση δεν βρέθηκε.");
  const currentCanonicalVariantIds = await currentMatches(current.query);
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

export async function updateCustomerSavedSearch(
  principal: SessionPrincipal,
  input: { searchId: string; name: string; query: SavedSearchQuery; now?: number }
): Promise<SavedSearch> {
  const searchId = input.searchId.trim();
  if (!searchId) throw new Error("Η αποθηκευμένη αναζήτηση είναι υποχρεωτική.");
  const now = input.now ?? Date.now();
  const name = normalizedName(input.name);
  const query = normalizeSavedSearchQuery(input.query);
  const currentCanonicalVariantIds = await currentMatches(query);

  if (customerStateBackend() === "memory") {
    const runtime = getAccountRuntime();
    const current = runtime.savedSearches.get(searchId);
    if (!current || current.userId !== principal.userId) throw new Error("Η αποθηκευμένη αναζήτηση δεν βρέθηκε.");
    return runtime.savedSearches.update({
      searchId,
      userId: principal.userId,
      name,
      query,
      currentCanonicalVariantIds,
      now
    });
  }

  const runtime = getProductionPostgresRuntime();
  const scope = customerScope(principal.userId);
  const searches = await runtime.persistence.engagement.listSavedSearches({ scope, userId: principal.userId });
  const current = searches.find((item) => item.id === searchId);
  if (!current) throw new Error("Η αποθηκευμένη αναζήτηση δεν βρέθηκε.");
  const baseline = [...new Set(currentCanonicalVariantIds)].slice(0, 500);
  const next: SavedSearch = {
    ...current,
    name,
    query,
    seenCanonicalVariantIds: baseline,
    lastObservedCount: baseline.length,
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
