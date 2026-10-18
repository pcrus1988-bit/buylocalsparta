import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/app/shop/page.tsx", "utf8");
const categories = readFileSync("apps/web/src/app/category/[slug]/page.tsx", "utf8");

assert.match(page, /showCategoryGuides\s*&&\s*guideCategories\.length\s*>\s*0/, "Indexable category guides should only appear on the appropriate landing page.");
assert.match(page, /page === 1 && !query && !category && !availability && !hasDetailedFilters/, "Filtered and paginated product searches should not repeat the landing-page SEO guide.");
assert.match(page, /<nav className="category-discovery-grid" aria-label="Μόνιμες σελίδες κατηγοριών">/, "Guides must expose accessible semantic navigation.");
assert.ok(page.includes("href={`/category/${item.slug}`}"), "Discovery links must point to the indexable category path, not filtered /shop URLs.");
assert.ok(page.includes('href="/shops"') && page.includes('href="/delivery-pickup"'), "Guides need relevant, durable local commerce links.");
assert.match(page, /robots: \{ index: false, follow: true \}/, "Do not regress noindex filtering of /shop query states.");
assert.match(categories, /category\.slug/, "The destination must resolve curated category slugs.");
assert.ok(!page.includes("100% SEO"), "Avoid unsupported ranking promises.");
console.log("Shop semantic category guide links and noindex-filter boundary OK.");
