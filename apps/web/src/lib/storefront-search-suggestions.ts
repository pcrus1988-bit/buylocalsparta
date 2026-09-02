import { searchTextRelevance } from "@buy-local-sparta/core";
import { getPublicProductSeoInventory } from "./catalog-view";
import {
  categoryCodeMatches,
  STOREFRONT_CATEGORIES,
  STOREFRONT_LEAF_INTENTS,
  type StorefrontCategory,
  type StorefrontLeafIntent
} from "./storefront-taxonomy";

export type StorefrontSearchSuggestionKind = "query" | "category" | "leaf" | "brand" | "product";

export type StorefrontSearchSuggestion = Readonly<{
  kind: StorefrontSearchSuggestionKind;
  label: string;
  href: string;
  subtitle?: string;
  count?: number;
  available?: boolean;
}>;

export type StorefrontSearchSuggestionResult = Readonly<{
  items: readonly StorefrontSearchSuggestion[];
  hasResults: boolean;
}>;

type QuerySeed = Readonly<{
  label: string;
  aliases: readonly string[];
  category?: string;
}>;

const QUERY_SEEDS: readonly QuerySeed[] = [
  { label: "Σχολικές τσάντες", aliases: ["school bags", "school bag", "sxolikes tsantes", "scholikes tsantes", "σχολική τσάντα"], category: "fashion" },
  { label: "Σχολικές τσάντες δημοτικού", aliases: ["primary school bags", "sxolikes tsantes dimotikou", "σχολική τσάντα δημοτικού"], category: "fashion" },
  { label: "Σχολικές τσάντες γυμνασίου", aliases: ["secondary school bags", "sxolikes tsantes gymnasiou", "σχολική τσάντα γυμνασίου"], category: "fashion" },
  { label: "Σχολικά είδη", aliases: ["school supplies", "sxolika", "scholika", "school"], category: "gifts" },
  { label: "Γυναικεία παπούτσια", aliases: ["women shoes", "womens shoes", "gynaikeia papoutsia", "γυναικείο παπούτσι"], category: "fashion" },
  { label: "Παιχνίδια", aliases: ["toys", "paixnidia", "games"], category: "kids" },
  { label: "Φωτιστικά", aliases: ["lamps", "lighting", "fotistika", "fwtistika"], category: "home-living" },
  { label: "Δράπανα", aliases: ["drills", "drapana", "power drills"], category: "tools-diy" },
  { label: "Smartphones", aliases: ["smartphone", "kinita", "κινητά"], category: "technology" },
  { label: "Τηλεοράσεις", aliases: ["televisions", "tvs", "tileoraseis"], category: "technology" }
];

export async function getStorefrontSearchSuggestions(query: string, limit = 12): Promise<StorefrontSearchSuggestionResult> {
  const clean = query.trim().slice(0, 120);
  if (clean.length < 2) return { items: [], hasResults: false };

  const inventory = await getPublicProductSeoInventory();
  const products = inventory.products;
  const max = Math.max(4, Math.min(20, limit));

  const queryItems = QUERY_SEEDS
    .map((seed) => ({ seed, score: searchTextRelevance(clean, [seed.label, ...seed.aliases]) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.seed.label.localeCompare(b.seed.label, "el"))
    .slice(0, 4)
    .map(({ seed }) => ({
      kind: "query" as const,
      label: seed.label,
      subtitle: "Προτεινόμενη αναζήτηση",
      href: shopHref({ q: seed.label, category: seed.category })
    }));

  const categoryItems = STOREFRONT_CATEGORIES
    .map((category) => ({ category, score: categoryScore(clean, category) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.category.label.localeCompare(b.category.label, "el"))
    .slice(0, 2)
    .map(({ category }) => ({
      kind: "category" as const,
      label: category.label,
      subtitle: category.eyebrow,
      count: products.filter((product) => categoryCodeMatches(product.categoryCode, category.slug, product.departmentCode)).length,
      href: shopHref({ category: category.slug })
    }));

  const leafItems = STOREFRONT_LEAF_INTENTS
    .map((leaf) => ({ leaf, score: leafScore(clean, leaf) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.leaf.label.localeCompare(b.leaf.label, "el"))
    .slice(0, 3)
    .map(({ leaf }) => ({
      kind: "leaf" as const,
      label: leaf.label,
      subtitle: categoryLabel(leaf.categorySlug),
      href: shopHref({ q: leaf.label, category: leaf.categorySlug })
    }));

  const brands = new Map<string, number>();
  for (const product of products) {
    const brand = product.brand?.trim();
    if (!brand) continue;
    const score = searchTextRelevance(clean, [brand]);
    if (score > 0) brands.set(brand, Math.max(brands.get(brand) ?? 0, score));
  }
  const brandItems = [...brands.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "el"))
    .slice(0, 2)
    .map(([brand]) => ({
      kind: "brand" as const,
      label: brand,
      subtitle: "Μάρκα",
      count: products.filter((product) => product.brand === brand).length,
      href: shopHref({ brand })
    }));

  const productItems = products
    .map((product) => ({
      product,
      score: searchTextRelevance(clean, [product.title, product.brand, product.categoryLabel, product.gtin, product.mpn])
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.product.offerAvailable) - Number(a.product.offerAvailable) || a.product.title.localeCompare(b.product.title, "el"))
    .slice(0, 4)
    .map(({ product }) => ({
      kind: "product" as const,
      label: product.title,
      subtitle: [product.brand, product.categoryLabel].filter(Boolean).join(" · ") || "Προϊόν",
      available: product.offerAvailable,
      href: `/product/${encodeURIComponent(product.slug)}`
    }));

  const items = dedupe([...queryItems, ...categoryItems, ...leafItems, ...brandItems, ...productItems]).slice(0, max);
  return { items, hasResults: productItems.length > 0 };
}

function categoryScore(query: string, category: StorefrontCategory): number {
  return searchTextRelevance(query, [category.label, category.name, category.eyebrow, category.searchHint, ...category.queryAliases]);
}

function leafScore(query: string, leaf: StorefrontLeafIntent): number {
  return searchTextRelevance(query, [leaf.label, ...leaf.aliases]);
}

function categoryLabel(slug: string): string | undefined {
  return STOREFRONT_CATEGORIES.find((category) => category.slug === slug)?.label;
}

function shopHref(input: Readonly<{ q?: string; category?: string; brand?: string }>): string {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.category) params.set("category", input.category);
  if (input.brand) params.set("brand", input.brand);
  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}

function dedupe(items: readonly StorefrontSearchSuggestion[]): readonly StorefrontSearchSuggestion[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.href}:${item.label.toLocaleLowerCase("el")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
