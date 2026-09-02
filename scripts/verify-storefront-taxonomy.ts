import { readFileSync } from "node:fs";
import { categoryCodeMatches, inferStorefrontCategoryFromQuery, STOREFRONT_CATEGORIES, storefrontCategoryForCode } from "../apps/web/src/lib/storefront-taxonomy.ts";

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

const intentCases: Array<[string, string]> = [
  ["lamp", "home-living"],
  ["lamps", "home-living"],
  ["φωτιστικά", "home-living"],
  ["fotistika", "home-living"],
  ["Bosch drill", "tools-diy"],
  ["Bosch δραπανο", "tools-diy"],
  ["γυναικεία παπούτσια", "fashion"],
  ["Samsung smartphone", "technology"],
  ["παιχνίδια", "kids"]
];
for (const [query, expectedSlug] of intentCases) {
  const actual = inferStorefrontCategoryFromQuery(query)?.slug;
  if (actual !== expectedSlug) failures.push(`Search intent "${query}" must infer ${expectedSlug}, received ${actual ?? "none"}`);
}
if (inferStorefrontCategoryFromQuery("gift for child")) failures.push("Ambiguous cross-department intent must remain unscoped instead of forcing a category");

const categoryPage = readFileSync(`${root}/apps/web/src/app/category/[slug]/page.tsx`, "utf8");
const shopPage = readFileSync(`${root}/apps/web/src/app/shop/page.tsx`, "utf8");
const homePage = readFileSync(`${root}/apps/web/src/app/page.tsx`, "utf8");
const catalogView = readFileSync(`${root}/apps/web/src/lib/catalog-view.ts`, "utf8");
const availableTaxonomy = readFileSync(`${root}/apps/web/src/lib/available-catalog-taxonomy.ts`, "utf8");
const productCard = readFileSync(`${root}/apps/web/src/components/CatalogProductCard.tsx`, "utf8");
const catalogSearchInput = readFileSync(`${root}/apps/web/src/components/CatalogSearchInput.tsx`, "utf8");

if (!categoryPage.includes('getCatalogCards(visitorKey, "23100", "", category.slug)')) failures.push("Category landing pages must filter the canonical public catalog through getCatalogCards");
if (!categoryPage.includes("storefrontCategoryBySlug(slug)")) failures.push("Canonical category routes must resolve from the governed static storefront taxonomy, not transient inventory availability");
if (!categoryPage.includes("STOREFRONT_CATEGORIES.map((category) => ({ slug: category.slug }))")) failures.push("Every governed storefront category must have a canonical /category/[slug] route regardless of current stock");
if (categoryPage.includes("const category = availableCategories.find((item) => item.slug === slug)")) failures.push("Category route existence must never be gated by current available inventory");
if (!homePage.includes('href={`/category/${category.slug}`}')) failures.push("Homepage category cards must point to the canonical category route");
if (!shopPage.includes('getCatalogCards(visitorKey, "23100", query, category')) failures.push("Shop category filter must be applied server-side");
if (!shopPage.includes("inferStorefrontCategoryFromQuery(taxonomyQuery)")) failures.push("Natural-language shop search must infer a governed storefront department when intent is unambiguous");
if (!catalogView.includes('categoryCodeMatches(product.categoryCode, category, product.departmentCode)')) failures.push("PostgreSQL catalog projection must filter category codes through the governed department hierarchy before fairness assignment");
if (!catalogView.includes('reason: "search_card"')) failures.push("Category browsing must retain search-card fairness assignment semantics");
if (!availableTaxonomy.includes("searchTextRelevance(query")) failures.push("Dynamic facets must use the same relevance engine as catalog results");
if (!productCard.includes("storefrontCategoryForCode(product.categoryCode, product.departmentCode)")) failures.push("Product cards must derive their visual category from canonical leaf and department codes");
if (!shopPage.includes("<CatalogSearchInput") || !catalogSearchInput.includes("/api/search/suggest")) failures.push("Shop search must retain governed catalogue autocomplete");
if (!catalogSearchInput.includes("AbortController") || !catalogSearchInput.includes("maxLength={120}")) failures.push("Catalogue autocomplete must cancel stale requests and retain the bounded search contract");

if (failures.length) {
  console.error("Storefront category checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Storefront category checks passed: ${STOREFRONT_CATEGORIES.length} primary categories, ${cases.length} taxonomy mappings and ${intentCases.length} query intents verified.`);
