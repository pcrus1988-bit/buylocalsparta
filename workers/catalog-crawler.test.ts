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

test("single Fournarakis product crawl emits sellable variant SKUs instead of the family code", async () => {
  const extractions: any[] = [];
  const store = {
    async listPendingPages() { return []; },
    async ensurePage() { return { id: "page-f", status: "queued", depth: 0 }; },
    async markFetching() {},
    async markSkipped() {},
    async markFailed() {},
    async saveExtraction(input: any) { extractions.push(input.candidate); return "accepted" as const; },
    async markFetched() {},
    async syncCounters() {},
    async renew() {},
    async finish() {}
  };
  const url = "https://www.fournarakis.gr/el/product/0033/classic-rolo-dermatino-18mm";
  const html = [
    '<html><body><main><h1>CLASSIC ΡΟΛΟ ΔΕΡΜΑΤΙΝΟ 18mm</h1><div class="mainContent">',
    '<img alt="BENMAN" src="https://assets.fournarakis.gr/mycontainer/Brand%20Logos/BENMAN.svg">',
    '<a href="https://assets.fournarakis.gr/mycontainer/Photos/1500x1500/0033.webp"><img alt="CLASSIC ΡΟΛΟ ΔΕΡΜΑΤΙΝΟ 18mm" src="https://assets.fournarakis.gr/mycontainer/Photos/0688x0688/0033.webp"></a>',
    '<div id="var_list"><span>ΚΩΔΙΚΟΣ</span><span>ΜΗΚΟΣ</span><span>ΤΜΧ /KOYTI</span></div>',
    '<div id="var_17202"><span>17202</span><span>10cm</span><span>12</span></div>',
    '<div id="var_16323"><span>16323</span><span>18cm</span><span>12</span></div>',
    '</div></main></body></html>'
  ].join("");
  const response: SecureCrawlFetchResult = {
    finalUrl: url,
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: Buffer.from(html),
    responseBytes: Buffer.byteLength(html),
    responseSha256: "b".repeat(64),
    resolvedAddresses: ["93.184.216.34"],
    redirectChain: []
  };

  const result = await runCrawlJob({
    store: store as any,
    job: {
      jobId: "job-f",
      profileId: "profile-f",
      sourceId: "source-f",
      crawlMode: "single",
      seedUrl: url,
      policySnapshot: {
        rootUrl: "https://www.fournarakis.gr/",
        allowedHosts: ["www.fournarakis.gr"],
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

  assert.deepEqual(result, { pages: 1, extractions: 2 });
  assert.deepEqual(extractions.map((item) => item.sku), ["17202", "16323"]);
  assert.equal(extractions.some((item) => item.sku === "0033"), false);
  assert.equal(extractions.every((item) => item.prices === undefined), true);
});


test("crawler dedupe preserves distinct supplier SKUs that share one product-family URL and title", async () => {
  const extractions: any[] = [];
  const store = {
    async listPendingPages() { return []; },
    async ensurePage() { return { id: "page-family", status: "queued", depth: 0 }; },
    async markFetching() {},
    async markSkipped() {},
    async markFailed() {},
    async saveExtraction(input: any) { extractions.push(input.candidate); return "accepted" as const; },
    async markFetched() {},
    async syncCounters() {},
    async renew() {},
    async finish() {}
  };
  const url = "https://www.fournarakis.gr/el/product/0033/classic-rolo-dermatino-18mm";
  const payload = {
    search_result_data: { code_catalogue: "0033", title: "CLASSIC ΡΟΛΟ ΔΕΡΜΑΤΙΝΟ 18mm", brand: { name: "BENMAN" } },
    brandInfo: { name: "BENMAN" },
    variations: [
      ["ΚΩΔΙΚΟΣ", "ΣΥΝΟΛΙΚΟ ΜΗΚΟΣ"],
      ["17202", "10cm"],
      ["16323", "18cm"],
      ["16324", "24cm"]
    ]
  };
  const html = '<html><body><script>const data = ' + JSON.stringify(payload) + ';</script><div id="product-app"></div></body></html>';
  const response: SecureCrawlFetchResult = {
    finalUrl: url,
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: Buffer.from(html),
    responseBytes: Buffer.byteLength(html),
    responseSha256: "c".repeat(64),
    resolvedAddresses: ["93.184.216.34"],
    redirectChain: []
  };

  const result = await runCrawlJob({
    store: store as any,
    job: {
      jobId: "job-family",
      profileId: "profile-family",
      sourceId: "source-family",
      crawlMode: "single",
      seedUrl: url,
      policySnapshot: {
        rootUrl: "https://www.fournarakis.gr/",
        allowedHosts: ["www.fournarakis.gr"],
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

  assert.deepEqual(result, { pages: 1, extractions: 3 });
  assert.deepEqual(extractions.map((item) => item.sku), ["17202", "16323", "16324"]);
  assert.deepEqual(extractions.map((item) => item.attributes["ΣΥΝΟΛΙΚΟ ΜΗΚΟΣ"]), ["10cm", "18cm", "24cm"]);
});
