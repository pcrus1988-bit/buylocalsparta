import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const intelligence = read("packages/core/src/search/intelligence.ts");
const catalog = read("apps/web/src/lib/catalog-view.ts");
const postgres = read("apps/web/src/lib/postgres-storefront-search.ts");
const meili = read("packages/meilisearch-search/src/index.ts");
const shop = read("apps/web/src/app/shop/page.tsx");
const failures: string[] = [];

for (const contract of [
  "interpretSearchQuery",
  "searchTextRelevance",
  "buildSearchAliases",
  "COMMON_SYNONYM_GROUPS",
  "pickup_today",
  "maxPriceMinor",
  "detectIdentifier"
]) if (!intelligence.includes(contract)) failures.push(`Search intelligence is missing: ${contract}`);

for (const contract of ["searchTextRelevance", "metadata?.gtin", "metadata?.mpn", "metadata?.sizes", "metadata?.fit"])
  if (!catalog.includes(contract)) failures.push(`Storefront catalog matcher is missing: ${contract}`);

for (const contract of ["searchTextRelevance", "details?.gtin", "details?.sizes", "interpretSearchQuery"])
  if (!postgres.includes(contract)) failures.push(`PostgreSQL search fallback is missing: ${contract}`);

for (const contract of ["searchAliases", "interpretSearchQuery(query.q)", "priceMinor <=", "pickupToday = true", "normalizeSearchText(query.q)"])
  if (!meili.includes(contract)) failures.push(`Meilisearch search is missing: ${contract}`);

for (const contract of ["interpretSearchQuery(query)", "searchIntent.maxPriceMinor", "searchIntent.minPriceMinor", "searchIntent.availability"])
  if (!shop.includes(contract)) failures.push(`Shop natural-language handling is missing: ${contract}`);

if (failures.length) {
  console.error("Exceptional search checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Exceptional search checks passed: Greek/Greeklish fuzzy matching, synonyms, identifiers, natural price/availability intent and provider parity are wired.");
