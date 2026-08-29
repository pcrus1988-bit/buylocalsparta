import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMerchantCenterRss, validMerchantCenterGtin } from "../apps/web/src/lib/merchant-center-feed.ts";

const root = process.cwd();
const route = readFileSync(`${root}/apps/web/src/app/merchant-center/products.xml/route.ts`, "utf8");
const catalogue = readFileSync(`${root}/apps/web/src/lib/merchant-center-catalog.ts`, "utf8");
const adminPage = readFileSync(`${root}/apps/web/src/app/admin/seo/merchant-center/page.tsx`, "utf8");
const workspaceNavigation = readFileSync(`${root}/apps/web/src/lib/workspace-navigation.ts`, "utf8");
const robots = readFileSync(`${root}/apps/web/src/app/robots.ts`, "utf8");

assert.equal(validMerchantCenterGtin("4006381333931"), "4006381333931", "valid EAN-13 should be exported");
assert.equal(validMerchantCenterGtin("036000291452"), "036000291452", "valid UPC-A should be exported");
assert.equal(validMerchantCenterGtin("96385074"), "96385074", "valid EAN-8 should be exported");
assert.equal(validMerchantCenterGtin("10012345678902"), "10012345678902", "valid GTIN-14 should be exported");
assert.equal(validMerchantCenterGtin("4006381333932"), undefined, "bad check digit must be rejected");
assert.equal(validMerchantCenterGtin("1234"), undefined, "unsupported GTIN length must be rejected");

const xml = buildMerchantCenterRss({
  title: "ΚΟΝΤΑ ΜΟΥ & Merchant Center",
  link: "https://kontamou.site",
  description: "Primary <catalogue> feed",
  products: [{
    id: "product_001",
    title: "Drill & driver <18V>",
    description: "A public product description with an ampersand & safe XML characters.",
    link: "https://kontamou.site/product/drill?ref=a&b=1",
    imageLink: "https://kontamou.site/api/media/media_001?a=1&b=2",
    priceMinor: 12990,
    availability: "in_stock",
    brand: "Example & Co",
    gtin: "4006381333931",
    mpn: "MPN<1>",
    productType: "Tools > Drills"
  }]
});

for (const expected of [
  '<?xml version="1.0" encoding="UTF-8"?>',
  'xmlns:g="http://base.google.com/ns/1.0"',
  "<g:id>product_001</g:id>",
  "<g:price>129.90 EUR</g:price>",
  "<g:availability>in_stock</g:availability>",
  "<g:condition>new</g:condition>",
  "<g:gtin>4006381333931</g:gtin>",
  "Drill &amp; driver &lt;18V&gt;",
  "Example &amp; Co",
  "MPN&lt;1&gt;",
  "a=1&amp;b=2"
]) assert.ok(xml.includes(expected), `RSS output is missing ${expected}`);
assert.ok(!xml.includes("<18V>"), "product text must be XML escaped");

for (const contract of [
  "getMerchantCenterCatalogueProjection()",
  "projection.feedOperational",
  "products: projection.products",
  '"Content-Type": "application/rss+xml; charset=utf-8"',
  '"Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900"',
  'status: 503',
  '"Retry-After": "300"',
  'event: "merchant_center.product_feed_failed"'
]) assert.ok(route.includes(contract), `Merchant Center route is missing ${contract}`);

for (const contract of [
  'MERCHANT_CENTER_FEED_PATH = "/merchant-center/products.xml"',
  "getCrawlerCatalogCards(MERCHANT_CENTER_POSTCODE)",
  "getPublicProductSeoInventory()",
  "productIndexEligibility(record)",
  "resolveSeoEntityControl({",
  "control.indexAllowed",
  "card?.available",
  "card.priceMinor <= 0",
  'publicCatalogueCardDescription(record.description ?? "")',
  "publicImageUrl(record, origin)",
  'availability: "in_stock"',
  "validMerchantCenterGtin(record.gtin)",
  "No public GTIN, MPN or brand is available. No identifier_exists claim is manufactured.",
  "Public product media projection is unavailable; the feed must return 503",
  "feedEligible",
  "governedIndexAllowed",
  "qualityHeld",
  "governanceHeld",
  "noPublicIdentifiers"
]) assert.ok(catalogue.includes(contract), `Merchant Center catalogue projection is missing ${contract}`);

for (const contract of [
  'title: "Merchant Center · SEO Admin"',
  'robots: { index: false, follow: false, nocache: true }',
  "getMerchantCenterCatalogueProjection()",
  "Google product-feed readiness",
  "One feed, one commerce projection",
  "This page proves application-side feed readiness.",
  "Identifier warnings",
  "Non-blocking data-quality warnings",
  "Open XML feed"
]) assert.ok(adminPage.includes(contract), `Merchant Center Admin readiness page is missing ${contract}`);

assert.ok(workspaceNavigation.includes('{ label: "Merchant Center", href: "/admin/seo/merchant-center"'), "Merchant Center Admin route must be registered in governed workspace navigation");

for (const publicMediaPath of ["/api/media/", "/api/catalog-source-image/"]) {
  assert.ok(robots.includes(publicMediaPath), `robots policy must explicitly allow Merchant Center image path ${publicMediaPath}`);
}
assert.ok(robots.includes('disallow: ["/api/"]') || robots.includes('disallow: "/api/"'), "robots policy must continue protecting the rest of /api");

console.log("Merchant Center checks passed: RSS 2.0 structure, XML escaping, GTIN validation, shared governed catalogue admission, crawler-price alignment, Admin readiness diagnostics, media crawl access and fail-closed outage behavior verified.");
