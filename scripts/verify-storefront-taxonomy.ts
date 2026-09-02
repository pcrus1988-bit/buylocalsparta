import { readFileSync } from "node:fs";
import {
  categoryCodeMatches,
  inferStorefrontCategoryFromQuery,
  inferStorefrontTaxonomyIntent,
  resolveStorefrontSubcategoryIntent,
  STOREFRONT_CATEGORIES,
  storefrontCategoryForCode,
  storefrontFacetEnabled
} from "../apps/web/src/lib/storefront-taxonomy.ts";
import {
  catalogAttributeDefinitionsForLeaf,
  catalogAttributeValue
} from "../apps/web/src/lib/catalog-attribute-facets.ts";
import { matchesCatalogAttributeFilters } from "../apps/web/src/lib/catalog-attribute-filter.ts";

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

const leafCases: Array<[string, string]> = [
  ["lamp", "lighting"],
  ["φωτιστικά", "lighting"],
  ["Bosch drill", "drills"],
  ["γυναικεία παπούτσια", "shoes"],
  ["Samsung smartphone", "smartphones"],
  ["παιχνίδια", "toys"],
  ["βιβλία", "books"]
];
for (const [query, expectedLeaf] of leafCases) {
  const actual = inferStorefrontTaxonomyIntent(query)?.leaf?.key;
  if (actual !== expectedLeaf) failures.push(`Search intent "${query}" must infer leaf ${expectedLeaf}, received ${actual ?? "none"}`);
}
if (inferStorefrontTaxonomyIntent("gift for child")) failures.push("Ambiguous department intent must not leak into leaf inference");

const lightingLeaf = inferStorefrontTaxonomyIntent("lamp")?.leaf;
const resolvedLighting = resolveStorefrontSubcategoryIntent(lightingLeaf, [
  { value: "home-lighting", label: "Φωτισμός" },
  { value: "kitchen-storage", label: "Αποθήκευση κουζίνας" }
]);
if (resolvedLighting?.value !== "home-lighting") failures.push(`Lamp leaf must resolve a unique available lighting branch, received ${resolvedLighting?.value ?? "none"}`);
const ambiguousLighting = resolveStorefrontSubcategoryIntent(lightingLeaf, [
  { value: "table-lamps", label: "Table Lamps" },
  { value: "floor-lamps", label: "Floor Lamps" }
]);
if (ambiguousLighting) failures.push("Leaf inference must stay broad when multiple available subcategories tie");
if (!storefrontFacetEnabled(lightingLeaf, "brand") || storefrontFacetEnabled(lightingLeaf, "fit")) failures.push("Lighting leaf must expose relevant facets without fashion fit noise");
const shoesLeaf = inferStorefrontTaxonomyIntent("shoes")?.leaf;
if (!storefrontFacetEnabled(shoesLeaf, "size") || !storefrontFacetEnabled(shoesLeaf, "fit")) failures.push("Shoe leaf must retain size and fit facets");
if (!(lightingLeaf?.attributeHints.length)) failures.push("Leaf intent must carry governed attribute hints for the structured facet layer");

const lightingAttributes = catalogAttributeDefinitionsForLeaf("lighting");
const socket = lightingAttributes.find((item) => item.key === "socket");
const wattage = lightingAttributes.find((item) => item.key === "wattage");
if (!socket || !wattage) failures.push("Lighting must govern socket and wattage attribute filters");
const syntheticAttributes = { socket_type: "E27", power_w: "10 W", random_merchant_field: "must-not-surface" };
if (catalogAttributeValue(syntheticAttributes, socket) !== "E27") failures.push("Governed source aliases must resolve socket_type to the socket facet");
if (catalogAttributeValue(syntheticAttributes, wattage) !== "10 W") failures.push("Governed source aliases must resolve power_w to the wattage facet");
if (!matchesCatalogAttributeFilters(syntheticAttributes, { socket: "E27", wattage: "10 W" })) failures.push("Structured attribute filters must accept matching governed values");
if (matchesCatalogAttributeFilters(syntheticAttributes, { socket: "GU10" })) failures.push("Structured attribute filters must reject non-matching governed values");
if (!matchesCatalogAttributeFilters(syntheticAttributes, { socket: "GU10", wattage: "10 W" }, "socket")) failures.push("Facet self-exclusion must ignore only the active structured attribute key");
if (catalogAttributeDefinitionsForLeaf("lighting").some((item) => item.key === "random_merchant_field")) failures.push("Arbitrary merchant metadata must never become an attribute facet without governance");
const smartphoneKeys = new Set(catalogAttributeDefinitionsForLeaf("smartphones").map((item) => item.key));
for (const key of ["storage", "ram", "screen_size", "5g", "dual_sim"]) if (!smartphoneKeys.has(key)) failures.push(`Smartphone leaf must govern ${key}`);

const categoryPage = readFileSync(`${root}/apps/web/src/app/category/[slug]/page.tsx`, "utf8");
const shopPage = readFileSync(`${root}/apps/web/src/app/shop/page.tsx`, "utf8");
const homePage = readFileSync(`${root}/apps/web/src/app/page.tsx`, "utf8");
const catalogView = readFileSync(`${root}/apps/web/src/lib/catalog-view.ts`, "utf8");
const catalogMetadata = readFileSync(`${root}/apps/web/src/lib/catalog-metadata.ts`, "utf8");
const attributeRegistry = readFileSync(`${root}/apps/web/src/lib/catalog-attribute-facets.ts`, "utf8");
const attributeFilter = readFileSync(`${root}/apps/web/src/lib/catalog-attribute-filter.ts`, "utf8");
const availableTaxonomy = readFileSync(`${root}/apps/web/src/lib/available-catalog-taxonomy.ts`, "utf8");
const productCard = readFileSync(`${root}/apps/web/src/components/CatalogProductCard.tsx`, "utf8");
const catalogSearchInput = readFileSync(`${root}/apps/web/src/components/CatalogSearchInput.tsx`, "utf8");

if (!categoryPage.includes('getCatalogCards(visitorKey, "23100", "", category.slug)')) failures.push("Category landing pages must filter the canonical public catalog through getCatalogCards");
if (!categoryPage.includes("storefrontCategoryBySlug(slug)")) failures.push("Canonical category routes must resolve from the governed static storefront taxonomy, not transient inventory availability");
if (!categoryPage.includes("STOREFRONT_CATEGORIES.map((category) => ({ slug: category.slug }))")) failures.push("Every governed storefront category must have a canonical /category/[slug] route regardless of current stock");
if (categoryPage.includes("const category = availableCategories.find((item) => item.slug === slug)")) failures.push("Category route existence must never be gated by current available inventory");
if (!homePage.includes('href={`/category/${category.slug}`}')) failures.push("Homepage category cards must point to the canonical category route");
if (!shopPage.includes('getCatalogCards(visitorKey, "23100", query, category')) failures.push("Shop category filter must be applied server-side");
if (!shopPage.includes("inferStorefrontTaxonomyIntent(taxonomyQuery)")) failures.push("Natural-language shop search must infer governed department and leaf intent when unambiguous");
if (!shopPage.includes("resolveStorefrontSubcategoryIntent(activeLeaf, taxonomy.facets.subcategories)")) failures.push("Leaf intent must resolve only against currently available catalogue subcategories");
if (!shopPage.includes("storefrontFacetEnabled(activeLeaf")) failures.push("Shop fixed facets must be conditioned by leaf-specific relevance");
if (!shopPage.includes("attributeFacets.map")) failures.push("Shop must render live governed structured attribute facets");
if (!shopPage.includes("filterCatalogCardsByAttributes(products, attributeFilters)")) failures.push("Selected structured attributes must filter rendered catalogue results");
if (!shopPage.includes("activeLeaf?.attributeHints")) failures.push("Shop must retain attribute guidance for sparse catalogues");
if (!catalogView.includes('categoryCodeMatches(product.categoryCode, category, product.departmentCode)')) failures.push("PostgreSQL catalog projection must filter category codes through the governed department hierarchy before fairness assignment");
if (!catalogView.includes('reason: "search_card"')) failures.push("Category browsing must retain search-card fairness assignment semantics");
if (!catalogMetadata.includes("attributes: { ...scalarAttributes(attributes), ...scalarAttributes(specifications) }")) failures.push("Catalog metadata must project scalar structured attributes from canonical and localized metadata");
if (!catalogMetadata.includes("typeof value === \"boolean\"")) failures.push("Structured attribute projection must normalize boolean scalar values");
if (!attributeRegistry.includes("const BY_LEAF")) failures.push("Structured attribute definitions must stay explicitly governed by leaf");
if (!attributeFilter.includes("catalogAttributeValueByKey")) failures.push("Structured attribute result filtering must resolve only governed attribute keys");
if (!availableTaxonomy.includes("catalogAttributeDefinitionsForLeaf(leafKey)")) failures.push("Available taxonomy must build attributes only from the inferred governed leaf");
if (!availableTaxonomy.includes("matchesCatalogAttributeFilters(details?.attributes, attributeFilters, definition.key)")) failures.push("Structured facet options must respect other selected attributes while self-excluding their own key");
if (!availableTaxonomy.includes("searchTextRelevance(query")) failures.push("Dynamic facets must use the same relevance engine as catalog results");
if (!productCard.includes("storefrontCategoryForCode(product.categoryCode, product.departmentCode)")) failures.push("Product cards must derive their visual category from canonical leaf and department codes");
if (!shopPage.includes("<CatalogSearchInput") || !catalogSearchInput.includes("/api/search/suggest")) failures.push("Shop search must retain governed catalogue autocomplete");
if (!catalogSearchInput.includes("AbortController") || !catalogSearchInput.includes("maxLength={120}")) failures.push("Catalogue autocomplete must cancel stale requests and retain the bounded search contract");

if (failures.length) {
  console.error("Storefront category checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Storefront category checks passed: ${STOREFRONT_CATEGORIES.length} primary categories, ${cases.length} taxonomy mappings, ${intentCases.length} department intents, ${leafCases.length} leaf intents and governed structured attribute facets verified.`);
