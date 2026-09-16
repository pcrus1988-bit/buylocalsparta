import assert from "node:assert/strict";
import test from "node:test";

import { SymphonyaApiError } from "../src/symphonya-v1.ts";
import { SymphonyaHttpTransport } from "../src/symphonya-http.ts";

type Captured = { url: string; init?: RequestInit };

function fakeFetch(responses: readonly unknown[], captured: Captured[], statuses: readonly number[] = []): typeof fetch {
  let index = 0;
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    captured.push({ url: String(input), init });
    const payload = responses[index] ?? {};
    const status = statuses[index] ?? 200;
    index += 1;
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

test("getProducts follows official path, pagination, oos and description contract without embedding a source secret", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport(
    { apiKey: "TEST_SECRET", baseUrl: "https://www.symphonya.eu" },
    fakeFetch([{
      error: false,
      response: [{
        id: 12345,
        ean: "8028713250774",
        name: "Example",
        brand: "Brand",
        gender: "Women",
        type: "Eau de parfum",
        cat: "perfumes",
        price: "10.50",
        stock: 4,
        warehouse: "Warehouse 1",
        image: "https://img.test/main.jpg",
        "image-1": "https://img.test/1.jpg",
        description: { short_description: "Short", how_to_use: "Use" }
      }]
    }], calls)
  );

  const page = await transport.getProducts({ page: 2, limit: 100, includeOutOfStock: true, includeDescription: true });
  assert.equal(page.products.length, 1);
  assert.equal(page.products[0]?.productId, "12345");
  assert.equal(page.products[0]?.wholesaleCostMinor, 1050);
  assert.equal(page.products[0]?.descriptionEn, "Short");
  assert.deepEqual(page.products[0]?.images, ["https://img.test/main.jpg", "https://img.test/1.jpg"]);

  const url = new URL(calls[0]!.url);
  assert.equal(url.pathname, "/api/getProducts/TEST_SECRET");
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(url.searchParams.get("offset"), "100");
  assert.equal(url.searchParams.get("oos"), "1");
  assert.equal(url.searchParams.get("include"), "description");
  assert.equal(url.searchParams.get("lang"), "en");
});

test("targeted getStock posts official ids body and normalizes operational stock", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport(
    { apiKey: "TEST_SECRET" },
    fakeFetch([{ error: false, response: [{ id: 12345, ean: "5901234567890", stock: "7", price: "12.34", warehouse: "Warehouse 2" }] }], calls)
  );

  const rows = await transport.getStock({ productIds: ["12345"] });
  assert.equal(rows[0]?.quantity, 7);
  assert.equal(rows[0]?.wholesaleCostMinor, 1234);
  assert.equal(rows[0]?.permitted, true);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.body, "ids=[12345]");
  assert.equal((calls[0]?.init?.headers as Record<string, string>)["Content-Type"], "text/plain");
});

test("getProductDetails enforces official maximum and posts product IDs", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport(
    { apiKey: "TEST_SECRET" },
    fakeFetch([{ error: false, response: { results: [{ id: 12345, ean: "8028713250774", name: "Name", description: { short_description: "Text", how_to_use: "How" } }], not_found: [] } }], calls)
  );

  const rows = await transport.getProductDetails({ productIds: ["12345"], lang: "en" });
  assert.equal(rows[0]?.descriptionEn, "Text");
  assert.equal(rows[0]?.howToUseEn, "How");
  assert.equal(calls[0]?.init?.body, "ids=[12345]");
  assert.match(calls[0]!.url, /getProductDetails\/TEST_SECRET\?lang=en$/);

  await assert.rejects(
    () => transport.getProductDetails({ productIds: Array.from({ length: 51 }, (_, index) => String(index + 1)) }),
    /at most 50/
  );
});

test("address resolution reuses an exact saved address before creating a new one", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport(
    { apiKey: "TEST_SECRET" },
    fakeFetch([{
      error: false,
      response: [{
        id: 77,
        "contact-person": "Test Person",
        "contact-phone": "+30 6900000000",
        "contact-email": "test@example.test",
        street: "Main 1",
        number: "",
        country: "Greece",
        city: "Sparta",
        county: "Laconia",
        zip: "23100"
      }]
    }], calls)
  );

  const address = await transport.resolveAddress({
    name: "Test Person",
    line1: "Main 1",
    postcode: "23100",
    city: "Sparta",
    region: "Laconia",
    countryCode: "GR",
    phone: "+30 6900000000",
    email: "test@example.test"
  });
  assert.equal(address.addressId, "77");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/api\/addresses\/TEST_SECRET\?list=$/);
});

test("createOrder uses form field order, preserves key, and rejects supplier partial success", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport(
    { apiKey: "TEST_SECRET" },
    fakeFetch([
      { error: false, response: "success", orderid: "900", partial: true, removed: [{ id: 12345, qty: 1, available: 0 }] },
      { error: false, response: "success", orderid: 900, status: "Canceled" }
    ], calls)
  );

  await assert.rejects(
    () => transport.createOrder({
      address: "77",
      message: "KONTA MOY KM-1001",
      key: 1,
      carrier: 2,
      products: [{ id: "12345", qty: 1 }]
    }, { idempotencyKey: "idem-1", allowPartialOrders: false }),
    (error: unknown) => error instanceof SymphonyaApiError && error.code === "SYMPHONYA_INSUFFICIENT_STOCK"
  );

  const createBody = new URLSearchParams(String(calls[0]?.init?.body));
  assert.deepEqual(JSON.parse(createBody.get("order")!), {
    address: 77,
    message: "KONTA MOY KM-1001",
    key: 1,
    carrier: 2,
    products: [{ id: 12345, qty: 1 }]
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1]!.url, /\/api\/cancelOrder\/TEST_SECRET$/);
});

test("documented createOrder errors become machine-readable failures", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport(
    { apiKey: "TEST_SECRET" },
    fakeFetch([{ error: true, errorCode: "credit_limit_exceeded", errorMessage: "Credit limit exceeded" }], calls)
  );

  await assert.rejects(
    () => transport.createOrder({
      address: "77",
      message: "KONTA MOY KM-1002",
      key: 1,
      carrier: 2,
      products: [{ id: "12345", qty: 1 }]
    }, { idempotencyKey: "idem-2", allowPartialOrders: false }),
    (error: unknown) => error instanceof SymphonyaApiError && error.code === "SYMPHONYA_CREDIT_LIMIT" && error.retryable === false
  );
});

test("getOrderStatus uses official order field, handles up to 50 IDs, and extracts AWB tracking", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport(
    { apiKey: "TEST_SECRET" },
    fakeFetch([{
      error: false,
      response: { results: [{
        id: 123,
        status: "Processing",
        payment_status: "paid",
        awb: { number: "1234567890", parcelId: "PARCEL123", tracking: { operations: [] } }
      }], not_found: [] }
    }], calls)
  );

  const rows = await transport.getOrderStatus(["123", "456"]);
  assert.equal(rows[0]?.orderId, "123");
  assert.equal(rows[0]?.paymentStatus, "paid");
  assert.equal(rows[0]?.awb, "1234567890");
  assert.equal(rows[0]?.parcelId, "PARCEL123");
  const body = new URLSearchParams(String(calls[0]?.init?.body));
  assert.deepEqual(JSON.parse(body.get("order")!), { ids: [123, 456] });

  await assert.rejects(
    () => transport.getOrderStatus(Array.from({ length: 51 }, (_, index) => String(index + 1))),
    /at most 50/
  );
});

test("price alerts are parsed in minor units and confirmations use products= JSON", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport(
    { apiKey: "TEST_SECRET" },
    fakeFetch([
      { error: false, response: [{ id: 123, ean: "5901234567890", old_price: "10.00", new_price: "12.50", hold: true }] },
      { error: false, errorMessage: "", response: "success", confirmed: 1, unconfirmed: 0 }
    ], calls)
  );

  const changes = await transport.getPriceChanges();
  assert.equal(changes[0]?.oldCostMinor, 1000);
  assert.equal(changes[0]?.newCostMinor, 1250);
  await transport.confirmPriceChanges({ productIds: ["123"] });
  const body = new URLSearchParams(String(calls[1]?.init?.body));
  assert.deepEqual(JSON.parse(body.get("products")!), { ids: [123] });
});

test("readiness performs a cheap one-row stock request", async () => {
  const calls: Captured[] = [];
  const transport = new SymphonyaHttpTransport({ apiKey: "TEST_SECRET" }, fakeFetch([{ error: false, response: [] }], calls));
  await transport.readiness();
  const url = new URL(calls[0]!.url);
  assert.equal(url.pathname, "/api/getStock/TEST_SECRET");
  assert.equal(url.searchParams.get("limit"), "1");
});
