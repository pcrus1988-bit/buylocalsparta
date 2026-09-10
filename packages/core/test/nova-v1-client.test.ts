import assert from "node:assert/strict";
import test from "node:test";
import { NovaV1Client } from "../../../integrations/dropship-suppliers/src/nova-v1.ts";

function response(value: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

test("Nova product reads include retailer store id", async () => {
  let observedUrl = "";
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async (input) => {
      observedUrl = String(input);
      return response([], { "x-sw-total": "12", "x-sw-totalpages": "3" });
    }
  });
  const page = await client.listProducts(77, { page: 2, per_page: 5, lang: "en" });
  const url = new URL(observedUrl);
  assert.equal(url.searchParams.get("store_id"), "77");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(page.total, 12);
  assert.equal(page.totalPages, 3);
});

test("Nova date filters are emitted in the provider's YYYY-MM-DDTHH:mm:ss format", async () => {
  let observedUrl = "";
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async (input) => {
      observedUrl = String(input);
      return response([]);
    }
  });
  await client.listProducts(2, {
    updated_at_min: "2026-09-10T16:01:50.318Z",
    updated_at_max: "2026-09-10T16:06:50.999Z"
  });
  const url = new URL(observedUrl);
  assert.equal(url.searchParams.get("updated_at_min"), "2026-09-10T16:01:50");
  assert.equal(url.searchParams.get("updated_at_max"), "2026-09-10T16:06:50");
});

test("Nova deleted-product date filters use the same provider timestamp format", async () => {
  let observedUrl = "";
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async (input) => {
      observedUrl = String(input);
      return response([]);
    }
  });
  await client.listDeletedProducts(2, {
    deleted_at_min: "2026-09-10T16:01:50.318Z",
    deleted_at_max: "2026-09-10T16:06:50.999Z"
  });
  const url = new URL(observedUrl);
  assert.equal(url.searchParams.get("deleted_at_min"), "2026-09-10T16:01:50");
  assert.equal(url.searchParams.get("deleted_at_max"), "2026-09-10T16:06:50");
});

test("Nova store discovery has no store id parameter", async () => {
  let observedUrl = "";
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async (input) => {
      observedUrl = String(input);
      return response([{ id: 9, name: "Retailer" }]);
    }
  });
  const stores = await client.getStores();
  assert.equal(new URL(observedUrl).search, "");
  assert.equal(stores[0]?.id, 9);
});

test("Nova bulk status scopes store in query, product ids in body, and enforces 100 id maximum", async () => {
  let observedUrl = "";
  let body: unknown = null;
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async (input, init) => {
      observedUrl = String(input);
      body = JSON.parse(String(init?.body));
      return response([{ id: 1, status: "publish" }]);
    }
  });
  await client.checkProductStatus("store-1", [1, 2]);
  assert.equal(new URL(observedUrl).searchParams.get("store_id"), "store-1");
  assert.deepEqual(body, { product_ids: [1, 2] });
  await assert.rejects(() => client.checkProductStatus("store-1", []), /between 1 and 100/);
  await assert.rejects(() => client.checkProductStatus("store-1", Array.from({ length: 101 }, (_, i) => i + 1)), /between 1 and 100/);
});

test("Nova order reads stay store-scoped and client exposes no order-write method", async () => {
  let observedUrl = "";
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async (input) => {
      observedUrl = String(input);
      return response({ id: 22, status: "pending" });
    }
  });
  await client.getOrder(77, 22);
  const url = new URL(observedUrl);
  assert.equal(url.searchParams.get("store_id"), "77");
  assert.equal("createOrder" in client, false);
});
