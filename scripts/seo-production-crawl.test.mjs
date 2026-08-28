import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDocument, canonicalKey, crawlProductionSeo, extractSitemapLocations } from "./seo-production-crawl.mjs";

function headers(values = {}) {
  const map = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get(name) { return map.get(String(name).toLowerCase()) ?? null; } };
}

function response(status, body, values = {}) {
  return {
    status,
    headers: headers(values),
    async text() { return body; }
  };
}

test("extracts sitemap locations and decodes XML entities", () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://kontamou.site/shop</loc></url><url><loc>https://kontamou.site/a&amp;b</loc></url></urlset>`;
  assert.deepEqual(extractSitemapLocations(xml), ["https://kontamou.site/shop", "https://kontamou.site/a&b"]);
});

test("canonical comparison normalizes trailing slashes but preserves query state", () => {
  assert.equal(canonicalKey("https://KONTAMOU.site/shop/"), canonicalKey("https://kontamou.site/shop"));
  assert.notEqual(canonicalKey("https://kontamou.site/shop?q=x"), canonicalKey("https://kontamou.site/shop"));
});

test("healthy indexable vendor page passes critical checks", () => {
  const html = `<!doctype html><html><head><title>Local Vendor in Sparta | KONTA MOU</title><meta name="description" content="A sufficiently descriptive local business page for the KONTA MOU marketplace in Sparta with verified public information."/><meta name="robots" content="index, follow"/><link rel="canonical" href="https://kontamou.site/vendor/example"/><script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Example"}</script></head><body><h1>Example local vendor</h1><p>${"Local marketplace content ".repeat(30)}</p></body></html>`;
  const result = analyzeDocument({ url: "https://kontamou.site/vendor/example", status: 200, headers: headers({ "content-type": "text/html" }), html, elapsedMs: 120 });
  assert.deepEqual(result.critical, []);
  assert.ok(result.schemaTypes.includes("LocalBusiness"));
});

test("sitemap page fails on noindex and canonical mismatch", () => {
  const html = `<html><head><title>Broken page title for SEO</title><meta name="description" content="This page intentionally contains enough description text to isolate indexability failures from content warnings in the test."/><meta name="robots" content="noindex, follow"/><link rel="canonical" href="https://kontamou.site/wrong"/></head><body><h1>Broken page</h1><p>${"Rendered content ".repeat(30)}</p></body></html>`;
  const result = analyzeDocument({ url: "https://kontamou.site/product/example", status: 200, headers: headers({ "x-robots-tag": "noindex, follow" }), html });
  assert.ok(result.critical.some((item) => item.includes("noindex")));
  assert.ok(result.critical.some((item) => item.includes("canonical mismatch")));
});

test("full crawl validates robots, sitemap and sitemap documents", async () => {
  const origin = "https://kontamou.site";
  const pageHtml = `<!doctype html><html><head><title>Products near you in Sparta | KONTA MOU</title><meta name="description" content="Discover local products and people through KONTA MOU, the human-first marketplace for Sparta and the surrounding area."/><meta name="robots" content="index, follow"/><link rel="canonical" href="https://kontamou.site/shop"/></head><body><h1>Products in Sparta</h1><p>${"Useful marketplace content ".repeat(30)}</p></body></html>`;
  const fetchImpl = async (url) => {
    if (url === `${origin}/robots.txt`) return response(200, `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, { "content-type": "text/plain" });
    if (url === `${origin}/sitemap.xml`) return response(200, `<?xml version="1.0"?><urlset><url><loc>${origin}/shop</loc></url></urlset>`, { "content-type": "application/xml" });
    if (url === `${origin}/shop`) return response(200, pageHtml, { "content-type": "text/html; charset=utf-8" });
    throw new Error(`Unexpected fetch ${url}`);
  };

  const report = await crawlProductionSeo({ origin, fetchImpl, concurrency: 2, timeoutMs: 1000, maxUrls: 10 });
  assert.equal(report.summary.checked, 1);
  assert.equal(report.summary.criticalFindings, 0);
  assert.equal(report.results[0].url, `${origin}/shop`);
});

test("full crawl rejects redirecting sitemap URLs", async () => {
  const origin = "https://kontamou.site";
  const fetchImpl = async (url) => {
    if (url === `${origin}/robots.txt`) return response(200, `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
    if (url === `${origin}/sitemap.xml`) return response(200, `<urlset><url><loc>${origin}/old</loc></url></urlset>`);
    if (url === `${origin}/old`) return response(308, "", { location: `${origin}/new` });
    throw new Error(`Unexpected fetch ${url}`);
  };

  const report = await crawlProductionSeo({ origin, fetchImpl, concurrency: 1, timeoutMs: 1000, maxUrls: 10 });
  assert.equal(report.summary.checked, 1);
  assert.ok(report.summary.criticalFindings > 0);
  assert.ok(report.results[0].critical[0].includes("redirect status 308"));
});
