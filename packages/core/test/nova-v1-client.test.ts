import assert from "node:assert/strict";
import test from "node:test";
import {
  NovaV1ApiError,
  NovaV1Client,
  NovaV1OrderSubmissionUncertainError
} from "../../../integrations/dropship-suppliers/src/nova-v1.ts";

function response(value: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
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

test("Nova order reads stay store-scoped", async () => {
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
});

test("Nova order creation is store-scoped and forwards the validated provider payload unchanged", async () => {
  let observedUrl = "";
  let observedMethod = "";
  let observedBody: unknown = null;
  const payload = {
    customer_reference: "KM-1001",
    line_items: [{ product_id: 123, variation_id: 456, quantity: 2 }],
    shipping: { country: "GR", city: "Sparta" }
  };
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async (input, init) => {
      observedUrl = String(input);
      observedMethod = init?.method ?? "";
      observedBody = JSON.parse(String(init?.body));
      return response({ id: 9001, status: "pending" });
    }
  });

  const created = await client.createOrder("retailer-77", payload);
  const url = new URL(observedUrl);
  assert.equal(url.pathname.endsWith("/orders"), true);
  assert.equal(url.searchParams.get("store_id"), "retailer-77");
  assert.equal(observedMethod, "POST");
  assert.deepEqual(observedBody, payload);
  assert.equal(created.id, 9001);
});

test("Nova order creation rejects empty payloads before any supplier mutation", async () => {
  let called = false;
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async () => {
      called = true;
      return response({});
    }
  });
  await assert.rejects(() => client.createOrder(1, {}), /non-empty JSON object/);
  assert.equal(called, false);
});

test("Nova order creation preserves definitive 4xx provider rejections", async () => {
  const client = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async () => response({ message: "invalid order", code: "invalid_order" }, {}, 422)
  });

  await assert.rejects(
    () => client.createOrder(1, { line_items: [{ product_id: 1, quantity: 1 }] }),
    (error: unknown) => {
      assert.equal(error instanceof NovaV1ApiError, true);
      assert.equal((error as NovaV1ApiError).status, 422);
      assert.equal((error as NovaV1ApiError).code, "invalid_order");
      return true;
    }
  );
});

test("Nova order creation marks network and 5xx outcomes uncertain so callers reconcile before retrying", async () => {
  const networkClient = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async () => { throw new Error("socket closed"); }
  });
  await assert.rejects(
    () => networkClient.createOrder(1, { line_items: [{ product_id: 1, quantity: 1 }] }),
    NovaV1OrderSubmissionUncertainError
  );

  const serverClient = new NovaV1Client({
    apiKey: "example-value",
    fetchImpl: async () => response({ message: "temporary failure" }, {}, 503)
  });
  await assert.rejects(
    () => serverClient.createOrder(1, { line_items: [{ product_id: 1, quantity: 1 }] }),
    NovaV1OrderSubmissionUncertainError
  );
});
