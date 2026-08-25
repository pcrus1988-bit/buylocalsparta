import test from "node:test";
import assert from "node:assert/strict";
import { MeilisearchClient } from "../src/index.ts";

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("indexes normalized aliases for Greek and cross-language discovery", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const queue = [response(202, { taskUid: 1 }), response(200, { uid: 1, status: "succeeded" })];
  const fetchMock: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = queue.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  };
  const client = new MeilisearchClient({ host: "https://search.test", indexUid: "products", adminApiKey: "admin", searchApiKey: "search", timeoutMs: 1000, taskTimeoutMs: 1000, taskPollMs: 1 }, fetchMock);
  await client.upsert({ id: "cv-1", type: "product", marketId: "sparta", title: "Παπούτσια Smartphone", titleEl: "Παπούτσια Smartphone", available: true });
  const indexed = JSON.parse(String(calls[0].init?.body));
  assert.ok(indexed[0].searchAliases.includes("papoutsia smartphone"));
  assert.ok(indexed[0].searchAliases.includes("kinito"));
});

test("normalizes Greek query and turns natural price/stock language into safe filters", async () => {
  let captured: Record<string, unknown> | undefined;
  const fetchMock: typeof fetch = async (_url, init) => {
    captured = JSON.parse(String(init?.body));
    return response(200, { hits: [] });
  };
  const client = new MeilisearchClient({ host: "https://search.test", indexUid: "products", adminApiKey: "admin", searchApiKey: "search", timeoutMs: 1000, taskTimeoutMs: 1000, taskPollMs: 1 }, fetchMock);
  await client.search({ marketId: "sparta", q: "Bosch δράπανο μέχρι 100€ διαθέσιμο τώρα", type: "product" });
  assert.equal(captured?.q, "bosch drapano");
  assert.match(String(captured?.filter), /available = true/);
  assert.match(String(captured?.filter), /priceMinor <= 10000/);
});

test("keeps numeric identifiers exact while typo tolerance remains available for words", async () => {
  let captured: Record<string, unknown> | undefined;
  const fetchMock: typeof fetch = async (_url, init) => {
    captured = JSON.parse(String(init?.body));
    return response(200, { hits: [] });
  };
  const client = new MeilisearchClient({ host: "https://search.test", indexUid: "products", adminApiKey: "admin", searchApiKey: "search", timeoutMs: 1000, taskTimeoutMs: 1000, taskPollMs: 1 }, fetchMock);
  await client.search({ marketId: "sparta", q: "5201234567890", type: "product" });
  assert.equal(captured?.q, "5201234567890");
});
