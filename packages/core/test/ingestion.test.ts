import test from "node:test";
import assert from "node:assert/strict";
import {
  isPublicIpAddress,
  normalizeGtin,
  planCanonicalization,
  validateCrawlUrl,
  validateExtractedProductCandidate,
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
