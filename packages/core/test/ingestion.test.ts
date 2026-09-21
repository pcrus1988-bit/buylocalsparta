import test from "node:test";
import assert from "node:assert/strict";
import {
  extractFournarakisProductCandidates,
  isFournarakisProductUrl,
  isPublicIpAddress,
  normalizeFournarakisDiscoveredUrl,
  normalizeGtin,
  planCanonicalization,
  validateCrawlUrl,
  validateExtractedProductCandidate,
  validateRedirectTarget,
  type CrawlFetchPolicy,
  type ExtractedProductCandidate,
  type ProductIdentity
} from "../src/index.ts";

const policy: CrawlFetchPolicy = {
  allowedHosts: ["example.com"],
  allowSubdomains: true
};

test("crawl URL guard allows an HTTPS public source on an allowed host", () => {
  const result = validateCrawlUrl("https://shop.example.com/products/42#details", policy, ["93.184.216.34"]);
  assert.equal(result.decision, "allow");
  assert.equal(result.normalizedUrl, "https://shop.example.com/products/42");
});

test("crawl URL guard rejects private and local targets", () => {
  assert.equal(validateCrawlUrl("https://127.0.0.1/admin", { allowedHosts: ["127.0.0.1"] }).decision, "reject");
  assert.equal(validateCrawlUrl("https://localhost/product", { allowedHosts: ["localhost"] }).decision, "reject");
  assert.equal(validateCrawlUrl("https://[::1]/admin", { allowedHosts: ["::1"] }).decision, "reject");
  assert.equal(validateCrawlUrl("https://shop.example.com/product", policy, ["10.1.2.3"]).decision, "reject");
  assert.equal(isPublicIpAddress("::1"), false);
  assert.equal(isPublicIpAddress("fc00::1"), false);
});

test("crawl URL guard rejects unapproved hosts, credentials, ports and plain HTTP", () => {
  assert.equal(validateCrawlUrl("https://evil.example.net/product", policy).decision, "reject");
  assert.equal(validateCrawlUrl("https://user:pass@example.com/product", policy).decision, "reject");
  assert.equal(validateCrawlUrl("https://example.com:8443/product", policy).decision, "reject");
  assert.equal(validateCrawlUrl("http://example.com/product", policy).decision, "reject");
});

test("redirect targets are revalidated against host and DNS security policy", () => {
  assert.equal(validateRedirectTarget("https://shop.example.com/next", policy, ["93.184.216.34"]).decision, "allow");
  assert.equal(validateRedirectTarget("https://evil.example.net/next", policy, ["93.184.216.34"]).decision, "reject");
  assert.equal(validateRedirectTarget("https://shop.example.com/next", policy, ["169.254.169.254"]).decision, "reject");
});

test("GTIN normalization verifies standard GS1 check digits", () => {
  assert.equal(normalizeGtin("0195949052637"), "0195949052637");
  assert.equal(normalizeGtin("0 195949 052637"), "0195949052637");
  assert.equal(normalizeGtin("0195949052638"), undefined);
  assert.equal(normalizeGtin("123"), undefined);
});

test("extracted product validation requires trustworthy identity and provenance", () => {
  const candidate: ExtractedProductCandidate = {
    sourceProductKey: "sku-1",
    sourceUrl: "https://example.com/p/sku-1",
    title: "Example product",
    gtin: "0195949052637",
    attributes: { color: "Black", size: "42" },
    prices: [{
      amountMinor: 12900,
      currency: "EUR",
      kind: "selling",
      evidence: { origin: "json_ld", sourceUrl: "https://example.com/p/sku-1", confidence: 1 }
    }],
    fieldEvidence: {
      title: { origin: "json_ld", sourceUrl: "https://example.com/p/sku-1", confidence: 1 },
      gtin: { origin: "json_ld", sourceUrl: "https://example.com/p/sku-1", confidence: 1 }
    }
  };
  const result = validateExtractedProductCandidate(candidate);
  assert.equal(result.valid, true);
  assert.equal(result.normalizedGtin, "0195949052637");
});

const identity: ProductIdentity = {
  id: "source",
  title: "Nike Example Runner",
  brand: "Nike",
  model: "EX-42",
  gtin: "0195949052637",
  condition: "new",
  attributes: { color: "Black", size: "42" }
};

test("canonicalization links one exact identity but reviews ambiguous automatic matches", () => {
  const existing: ProductIdentity = { ...identity, id: "canonical-1" };
  assert.equal(planCanonicalization(identity, [existing]).disposition, "link_existing");

  const ambiguous = planCanonicalization(identity, [
    existing,
    { ...identity, id: "canonical-2" }
  ]);
  assert.equal(ambiguous.disposition, "review");
  assert.equal(ambiguous.candidates.length, 2);
});

test("material variant conflicts never auto-link", () => {
  const differentSize: ProductIdentity = {
    ...identity,
    id: "canonical-size-43",
    gtin: undefined,
    attributes: { color: "Black", size: "43" }
  };
  const withoutGtin: ProductIdentity = { ...identity, gtin: undefined };
  assert.equal(planCanonicalization(withoutGtin, [differentSize]).disposition, "create_canonical");
});


test("Fournarakis adapter expands the product-family variant grid into orderable supplier SKUs", () => {
  const sourceUrl = "https://www.fournarakis.gr/el/product/0033/classic-rolo-dermatino-18mm";
  const html = [
    '<html><head><link rel="canonical" href="' + sourceUrl + '"></head><body>',
    '<main><nav><ol>',
    '<li><a href="/el/catalog/c/6/ergalia"><span>ΕΡΓΑΛΕΙΑ</span></a></li>',
    '<li><a href="/el/catalog/c/61/chromatopolio"><span>ΧΡΩΜΑΤΟΠΩΛΕΙΟ</span></a></li>',
    '<li><a href="/el/catalog/c/85/rola"><span>ΡΟΛΑ</span></a></li>',
    '</ol></nav>',
    '<h1>CLASSIC ΡΟΛΟ ΔΕΡΜΑΤΙΝΟ 18mm</h1>',
    '<div class="mainContent">',
    '<img alt="BENMAN" src="https://assets.fournarakis.gr/mycontainer/Brand%20Logos/BENMAN.svg">',
    '<a data-fancybox="gallery" href="https://assets.fournarakis.gr/mycontainer/Photos/1500x1500/0033.webp">',
    '<img alt="CLASSIC ΡΟΛΟ ΔΕΡΜΑΤΙΝΟ 18mm" src="https://assets.fournarakis.gr/mycontainer/Photos/0688x0688/0033.webp"></a>',
    '<div class="pt-6 pb-6 min-h-[60px]"><ul><li>Γούνα Merinos</li><li>Μεγάλη αντοχή</li></ul></div>',
    '<div id="var_list"><span>ΚΩΔΙΚΟΣ</span><span>ΣΥΝΟΛΙΚΟ ΜΗΚΟΣ</span><span>Ø ΚΥΛΙΝΔΡΟΥ</span><span>ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ</span><span>ΤΜΧ /KOYTI</span></div>',
    '<div id="var_17202"><span>17202</span><span>10cm</span><span>50mm</span><span>22874</span><span>12</span></div>',
    '<div id="var_16323"><span>16323</span><span>18cm</span><span>50mm</span><span>22875</span><span>12</span></div>',
    '<div id="var_16324"><span>16324</span><span>24cm</span><span>50mm</span><span>22876</span><span>12</span></div>',
    '</div></main></body></html>'
  ].join("");

  const candidates = extractFournarakisProductCandidates(html, sourceUrl);
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((item) => item.sku), ["17202", "16323", "16324"]);
  assert.equal(candidates[0].sourceProductKey, "17202");
  assert.equal(candidates[0].brand, "BENMAN");
  assert.deepEqual(candidates[0].categoryPath, ["ΕΡΓΑΛΕΙΑ", "ΧΡΩΜΑΤΟΠΩΛΕΙΟ", "ΡΟΛΑ"]);
  assert.equal(candidates[0].attributes["ΣΥΝΟΛΙΚΟ ΜΗΚΟΣ"], "10cm");
  assert.equal(candidates[0].attributes["Fournarakis family code"], "0033");
  assert.equal(candidates[0].images?.[0]?.url, "https://assets.fournarakis.gr/mycontainer/Photos/1500x1500/0033.webp");
  assert.equal((candidates[0].rawPayload as Record<string, unknown>).requiresPricingPdfJoin, true);
});

test("Fournarakis crawl scope keeps Greek catalogue/product pages and removes duplicate query filters", () => {
  const seed = "https://www.fournarakis.gr/";
  assert.equal(isFournarakisProductUrl("https://www.fournarakis.gr/el/product/0033/example"), true);
  assert.equal(
    normalizeFournarakisDiscoveredUrl("https://fournarakis.gr/el/catalog/b/15/ffg?tags=must_have#search-app", seed),
    "https://www.fournarakis.gr/el/catalog/b/15/ffg"
  );
  assert.equal(normalizeFournarakisDiscoveredUrl("https://www.fournarakis.gr/fr/product/0033/example", seed), undefined);
  assert.equal(normalizeFournarakisDiscoveredUrl("https://www.fournarakis.gr/el/etaireia/i-istoria-mas", seed), undefined);
  assert.equal(normalizeFournarakisDiscoveredUrl("https://assets.fournarakis.gr/mycontainer/Photos/1500x1500/0033.webp", seed), undefined);
});
