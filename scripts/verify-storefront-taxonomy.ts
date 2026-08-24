import { readFileSync } from "node:fs";
import { categoryCodeMatches, STOREFRONT_CATEGORIES, storefrontCategoryForCode } from "../apps/web/src/lib/storefront-taxonomy.ts";

const root = process.cwd();
const failures: string[] = [];
const slugs = STOREFRONT_CATEGORIES.map((category) => category.slug);
if (STOREFRONT_CATEGORIES.length !== 9) failures.push("Storefront must expose the nine primary non-food discovery categories");
if (new Set(slugs).size !== slugs.length) failures.push("Storefront category slugs must be unique");

const cases: Array<[string, string]> = [
  ["home-lighting", "home-living"],
  ["technology", "technology"],
  ["stationery", "gifts"],
  ["toys", "kids"],
  ["cosmetics", "beauty"],
  ["footwear", "fashion"],
  ["power-tools", "tools-diy"],
  ["agricultural-hand-tools", "garden-outdoors"],
  ["vehicle-emergency-tools", "automotive"],
  ["drinkware", "home-living"]
];
for (const [code, expectedSlug] of cases) {
  const actual = storefrontCategoryForCode(code).slug;
  if (actual !== expectedSlug) failures.push(`${code} must map to ${expectedSlug}, received ${actual}`);
  if (!categoryCodeMatches(code, expectedSlug)) failures.push(`${code} must match requested category ${expectedSlug}`);
}
if (categoryCodeMatches("technology", "beauty")) failures.push("Unrelated category codes must not cross-match");
if (storefrontCategoryForCode("pressure-washers", "diy-building-trade").slug !== "tools-diy") failures.push("Leaf categories must inherit the governed DIY department mapping");
if (!categoryCodeMatches("pressure-washers", "tools-diy", "diy-building-trade")) failures.push("Department-aware category filtering must admit governed DIY descendants");

const categoryPage = readFileSync(`${root}/apps/web/src/app/category/[slug]/page.tsx`, "utf8");
const shopPage = readFileSync(`${root}/apps/web/src/app/shop/page.tsx`, "utf8");
const catalogView = readFileSync(`${root}/apps/web/src/lib/catalog-view.ts`, "utf8");
const productCard = readFileSync(`${root}/apps/web/src/components/CatalogProductCard.tsx`, "utf8");
const catalogSearchInput = readFileSync(`${root}/apps/web/src/components/CatalogSearchInput.tsx`, "utf8");

if (!categoryPage.includes('getCatalogCards(visitorKey, "23100", "", category.slug)')) failures.push("Category landing pages must filter the canonical public catalog through getCatalogCards");
if (!shopPage.includes('getCatalogCards(visitorKey, "23100", query, category')) failures.push("Shop category filter must be applied server-side");
if (!catalogView.includes('categoryCodeMatches(product.categoryCode, category, product.departmentCode)')) failures.push("PostgreSQL catalog projection must filter category codes through the governed department hierarchy before fairness assignment");
if (!catalogView.includes('reason: "search_card"')) failures.push("Category browsing must retain search-card fairness assignment semantics");
if (!productCard.includes("storefrontCategoryForCode(product.categoryCode, product.departmentCode)")) failures.push("Product cards must derive their visual category from canonical leaf and department codes");
if (!shopPage.includes("<CatalogSearchInput") || !catalogSearchInput.includes("/api/search/suggest")) failures.push("Shop search must retain governed catalogue autocomplete");
if (!catalogSearchInput.includes("AbortController") || !catalogSearchInput.includes("maxLength={120}")) failures.push("Catalogue autocomplete must cancel stale requests and retain the bounded search contract");

if (failures.length) {
  console.error("Storefront category checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Storefront category checks passed: ${STOREFRONT_CATEGORIES.length} primary categories and ${cases.length} taxonomy mappings verified.`);
