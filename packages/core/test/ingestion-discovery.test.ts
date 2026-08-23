import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverHtmlUrls,
  extractJsonLdProductCandidates,
  parseRobotsTxt,
  parseSitemapXml,
  robotsAllowsUrl
} from "../src/index.ts";

test("robots parser selects the crawler group, keeps sitemaps and applies longest rule", () => {
  const policy = parseRobotsTxt(`
User-agent: *
Disallow: /private/
Allow: /private/public/
Sitemap: https://shop.example.com/sitemap.xml

User-agent: OtherBot
Disallow: /
`, "KONTAMOU-CatalogBot");
  assert.deepEqual(policy.sitemaps, ["https://shop.example.com/sitemap.xml"]);
  assert.equal(robotsAllowsUrl(policy, "https://shop.example.com/products/1"), true);
  assert.equal(robotsAllowsUrl(policy, "https://shop.example.com/private/secret"), false);
  assert.equal(robotsAllowsUrl(policy, "https://shop.example.com/private/public/42"), true);
});

test("sitemap parser resolves entity-encoded and relative locations without duplicates", () => {
  const urls = parseSitemapXml(`<?xml version="1.0"?><urlset>
    <url><loc>https://shop.example.com/p/1?x=1&amp;y=2</loc></url>
    <url><loc>/p/2</loc></url>
    <url><loc>/p/2</loc></url>
  </urlset>`, "https://shop.example.com/sitemap.xml");
  assert.deepEqual(urls, [
    "https://shop.example.com/p/1?x=1&y=2",
    "https://shop.example.com/p/2"
  ]);
});

test("HTML URL discovery resolves relative links and ignores non-web schemes", () => {
  const urls = discoverHtmlUrls(`
    <a href="/products/42#reviews">Product</a>
    <a href='https://shop.example.com/category/tools'>Tools</a>
    <a href="mailto:sales@example.com">Mail</a>
    <a href="javascript:void(0)">Ignore</a>
  `, "https://shop.example.com/catalog");
  assert.deepEqual(urls, [
    "https://shop.example.com/products/42",
    "https://shop.example.com/category/tools"
  ]);
});

test("JSON-LD Product extraction preserves identity, variants, prices, images and provenance", () => {
  const [candidate] = extractJsonLdProductCandidates(`
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Bormann Example Drill 20V",
    "description": "Cordless drill with two batteries and carrying case.",
    "sku": "BHT7316",
    "mpn": "BHT7316",
    "gtin13": "0195949052637",
    "brand": {"@type":"Brand","name":"Bormann"},
    "model": "BHT7316",
    "color": "Black",
    "size": "20V",
    "image": ["/media/bht7316-1.jpg", {"contentUrl":"https://cdn.example.com/bht7316-2.jpg"}],
    "category": "Tools > Power Tools > Drills",
    "offers": {"@type":"Offer","price":"129.90","priceCurrency":"EUR"},
    "url": "/product/bht7316"
  }
  </script>`, "https://shop.example.com/product/bht7316");
  assert.ok(candidate);
  assert.equal(candidate.sourceProductKey, "BHT7316");
  assert.equal(candidate.title, "Bormann Example Drill 20V");
  assert.equal(candidate.brand, "Bormann");
  assert.equal(candidate.gtin, "0195949052637");
  assert.equal(candidate.variantAttributes?.color, "Black");
  assert.equal(candidate.variantAttributes?.size, "20V");
  assert.deepEqual(candidate.categoryPath, ["Tools", "Power Tools", "Drills"]);
  assert.equal(candidate.prices?.[0]?.amountMinor, 12990);
  assert.equal(candidate.prices?.[0]?.currency, "EUR");
  assert.equal(candidate.images?.[0]?.url, "https://shop.example.com/media/bht7316-1.jpg");
  assert.equal(candidate.fieldEvidence.title.origin, "json_ld");
  assert.equal(candidate.fieldEvidence.title.sourceUrl, "https://shop.example.com/product/bht7316");
});

test("JSON-LD extractor walks @graph and ignores malformed scripts", () => {
  const candidates = extractJsonLdProductCandidates(`
    <script type="application/ld+json">not-json</script>
    <script type='application/ld+json'>{"@graph":[
      {"@type":"BreadcrumbList","name":"crumbs"},
      {"@type":["Thing","Product"],"name":"Graph Product","sku":"SKU-9"}
    ]}</script>
  `, "https://shop.example.com/p/9");
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceProductKey, "SKU-9");
});
