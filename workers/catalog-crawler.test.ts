import test from "node:test";
import assert from "node:assert/strict";
import { createPinnedLookup, type SecureCrawlFetchResult } from "./catalog-crawler/transport.ts";
import { parseCrawlPolicySnapshot, runCrawlJob } from "./catalog-crawler/runner.ts";

test("pinned lookup returns only the validated address and rejects hostname changes", async () => {
  const lookup = createPinnedLookup("93.184.216.34", 4, "example.com") as any;
  const allowed = await new Promise<{ address: string; family: number }>((resolve, reject) => {
    lookup("example.com", {}, (error: Error | null, address: string, family: number) => error ? reject(error) : resolve({ address, family }));
  });
  assert.deepEqual(allowed, { address: "93.184.216.34", family: 4 });

  await assert.rejects(new Promise<void>((resolve, reject) => {
    lookup("evil.example.net", {}, (error: Error | null) => error ? reject(error) : resolve());
  }), /unexpected hostname/i);
});

test("crawl policy snapshots are bounded and require an allowlist", () => {
  const policy = parseCrawlPolicySnapshot({
    rootUrl: "https://example.com/",
    allowedHosts: ["example.com"],
    allowSubdomains: false,
    allowHttp: false,
    obeyRobots: true,
    fetchMode: "http",
    maxPages: 250,
    maxDepth: 6,
    maxConcurrency: 4,
    requestsPerSecond: 2,
    maxResponseBytes: 1_000_000,
    maxRedirects: 5,
    includeRules: [],
    excludeRules: []
  });
  assert.equal(policy.maxPages, 250);
  assert.equal(policy.requestsPerSecond, 2);
  assert.throws(() => parseCrawlPolicySnapshot({ rootUrl: "https://example.com/", allowedHosts: [] }), /allowedHosts/i);
  assert.throws(() => parseCrawlPolicySnapshot({ rootUrl: "https://example.com/", allowedHosts: ["example.com"], maxPages: 250001 }), /maxPages/i);
});

test("single-product crawl extracts JSON-LD and completes without external network access", async () => {
  const events: string[] = [];
  const extractions: unknown[] = [];
  const store = {
    async listPendingPages() { return []; },
    async ensurePage() { events.push("ensure"); return { id: "page-1", status: "queued", depth: 0 }; },
    async markFetching() { events.push("fetching"); },
    async markSkipped() { events.push("skipped"); },
    async markFailed() { events.push("failed"); },
    async saveExtraction(input: any) { events.push("extraction"); extractions.push(input.candidate); return "accepted" as const; },
    async markFetched() { events.push("fetched"); },
    async syncCounters() {},
    async renew() { events.push("renew"); },
    async finish() { events.push("finish"); }
  };
  const html = `<!doctype html><html><head><script type="application/ld+json">{
    "@context":"https://schema.org","@type":"Product","name":"Test Drill",
    "sku":"DRILL-1","gtin13":"0195949052637","brand":{"@type":"Brand","name":"Example"},
    "offers":{"@type":"Offer","price":"129.00","priceCurrency":"EUR"}
  }</script></head><body></body></html>`;
  const response: SecureCrawlFetchResult = {
    finalUrl: "https://example.com/p/drill-1",
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: Buffer.from(html),
    responseBytes: Buffer.byteLength(html),
    responseSha256: "a".repeat(64),
    resolvedAddresses: ["93.184.216.34"],
    redirectChain: []
  };

  const result = await runCrawlJob({
    store: store as any,
    job: {
      jobId: "job-1",
      profileId: "profile-1",
      sourceId: "source-1",
      crawlMode: "single",
      seedUrl: "https://example.com/p/drill-1",
      policySnapshot: {
        rootUrl: "https://example.com/",
        allowedHosts: ["example.com"],
        allowSubdomains: false,
        allowHttp: false,
        obeyRobots: false,
        fetchMode: "http",
        maxPages: 10,
        maxDepth: 2,
        maxConcurrency: 1,
        requestsPerSecond: 20,
        maxResponseBytes: 1_000_000,
        maxRedirects: 3,
        includeRules: [],
        excludeRules: []
      },
      extractorVersion: "web-crawler-v1",
      attemptCount: 1
    },
    workerId: "test-worker",
    leaseSeconds: 300,
    userAgent: "KONTAMOU-TestBot/1.0",
    requestTimeoutMs: 1000,
    fetcher: async () => response
  });

  assert.deepEqual(result, { pages: 1, extractions: 1 });
  assert.equal((extractions[0] as any).title, "Test Drill");
  assert.equal((extractions[0] as any).gtin, "0195949052637");
  assert.deepEqual(events, ["ensure", "fetching", "extraction", "fetched", "renew", "finish"]);
});