import { normalizeSearchText } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogMetadata } from "./catalog-metadata";
import { catalogAttributeValueByKey } from "./catalog-attribute-facets";

export type CatalogAttributeFilters = Readonly<Record<string, string>>;

export function matchesCatalogAttributeFilters(
  attributes: Readonly<Record<string, string>> | undefined,
  filters: CatalogAttributeFilters,
  omittedKey?: string
): boolean {
  for (const [key, selected] of Object.entries(filters)) {
    if (!selected || key === omittedKey) continue;
    const actual = catalogAttributeValueByKey(attributes, key);
    if (normalizeSearchText(actual ?? "") !== normalizeSearchText(selected)) return false;
  }
  return true;
}

export async function filterCatalogCardsByAttributes<T extends CatalogCard>(
  cards: readonly T[],
  filters: CatalogAttributeFilters
): Promise<readonly T[]> {
  const selected = Object.entries(filters).filter(([, value]) => Boolean(value));
  if (cards.length === 0 || selected.length === 0) return cards;
  const metadata = await loadCatalogMetadata(cards.map((card) => card.id));
  return cards.filter((card) => matchesCatalogAttributeFilters(metadata.get(card.id)?.attributes, filters));
}
