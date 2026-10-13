import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

test("product sitemap re-reads the live sellable catalogue within five minutes", () => {
  const inventory = source("apps/web/src/lib/product-sitemap-inventory.ts");
  const productXml = source("apps/web/src/app/sitemaps/products/[shard]/route.ts");
  const sitemapIndex = source("apps/web/src/app/sitemap.xml/route.ts");

  assert.match(inventory, /public-product-sitemap-inventory-shard-v9-live-catalogue-20261013/);
  assert.match(inventory, /\{ revalidate: 300 \}/);
  assert.match(inventory, /rm\.local_available_until>now\(\)/);
  assert.match(inventory, /live\.available_until>now\(\)/);
  assert.match(inventory, /live\.sellable=true/);
  assert.match(inventory, /to_jsonb\(pm\)->>\x27source_id\x27/);
  assert.match(inventory, /to_jsonb\(pm\)->>\x27source_url\x27/);
  assert.doesNotMatch(inventory, /pm\.source_id|pm\.source_url/);
  assert.match(inventory, /rm\.dropship_available_until>now\(\)/);
  assert.match(productXml, /s-maxage=300, stale-while-revalidate=60/);
  assert.match(sitemapIndex, /s-maxage=300, stale-while-revalidate=60/);
});

test("transient data failure never publishes a successful empty product sitemap", () => {
  const sourceText = source("apps/web/src/app/sitemaps/products/[shard]/route.ts");
  assert.match(sourceText, /status: 503/);
  assert.match(sourceText, /"Cache-Control": "no-store"/);
  assert.match(sourceText, /"Retry-After": "300"/);
  assert.match(sourceText, /"X-Konta-Sitemap-Degraded": "1"/);
  assert.match(sourceText, /if \(!settings\.indexingEnabled \|\| !settings\.sitemap\.products\)/);
});
