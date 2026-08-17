import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresCatalogRepository,
  PostgresInventoryRepository,
  PostgresUnitOfWork,
  adaptPgPool,
  type SqlPool,
  type SqlQueryResult,
  type SqlRow
} from "../src/index.ts";

class RecordingClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  released = false;
  failOn?: RegExp;
  responses: Array<SqlQueryResult<any>> = [];

  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (this.failOn?.test(text)) throw new Error("database failure");
    return (this.responses.shift() ?? { rows: [], rowCount: 0 }) as SqlQueryResult<Row>;
  }
  release() { this.released = true; }
}

function poolWith(client: RecordingClient): SqlPool {
  return {
    async connect() { return client; },
    async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
      return client.query<Row>(text, params);
    }
  };
}

test("Postgres unit of work scopes RLS context and commits", async () => {
  const client = new RecordingClient();
  const uow = new PostgresUnitOfWork(poolWith(client));
  const result = await uow.withTransaction(
    { actorUserId: "actor-1", vendorId: "vendor-1", marketId: "market-1", requestId: "req-1", platformAccess: false },
    async (tx) => {
      await tx.query("SELECT 42");
      return 42;
    },
    { isolation: "serializable", lockTimeoutMs: 900 }
  );
  assert.equal(result, 42);
  assert.equal(client.calls[0].text, "BEGIN ISOLATION LEVEL SERIALIZABLE");
  assert.equal(client.calls.some((call) => call.text.includes("set_config") && call.params[0] === "app.vendor_id" && call.params[1] === "vendor-1"), true);
  assert.equal(client.calls.some((call) => call.text.includes("FROM vendor_businesses") && call.params[0] === "app.vendor_id"), true);
  assert.equal(client.calls.some((call) => call.text.includes("FROM users") && call.params[0] === "app.actor_user_id" && call.params[1] === "actor-1"), true);
  assert.equal(client.calls.some((call) => call.text.includes("FROM markets") && call.params[0] === "app.market_id" && call.params[1] === "market-1"), true);
  assert.equal(client.calls.some((call) => call.text.includes("set_config") && call.params[0] === "app.platform_access" && call.params[1] === "false"), true);
  assert.equal(client.calls.some((call) => call.text === "SELECT 42"), true);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.equal(client.released, true);
});


test("Postgres unit of work enables explicit platform RLS scope only when requested", async () => {
  const client = new RecordingClient();
  const uow = new PostgresUnitOfWork(poolWith(client));
  await uow.withTransaction({ actorUserId: "admin-1", marketId: "market-1", platformAccess: true }, async () => undefined);
  assert.equal(client.calls.some((call) => call.text.includes("set_config") && call.params[0] === "app.platform_access" && call.params[1] === "true"), true);
  assert.equal(client.calls.some((call) => call.text.includes("set_config") && call.params[0] === "app.vendor_id" && call.params[1] === ""), true);
});
test("Postgres unit of work rolls back and releases on failure", async () => {
  const client = new RecordingClient();
  client.failOn = /BROKEN/;
  const uow = new PostgresUnitOfWork(poolWith(client));
  await assert.rejects(() => uow.withTransaction({}, async (tx) => {
    await tx.query("BROKEN QUERY");
  }), /database failure/);
  assert.equal(client.calls.some((call) => call.text === "ROLLBACK"), true);
  assert.equal(client.calls.some((call) => call.text === "COMMIT"), false);
  assert.equal(client.released, true);
});

test("catalog repository maps canonical products from SQL without leaking supplier offers", async () => {
  const client = new RecordingClient();
  client.responses.push({
    rowCount: 1,
    rows: [{
      id: "11111111-1111-4111-8111-111111111111",
      public_id: "cv-lamp-public",
      market_id: "22222222-2222-4222-8222-222222222222",
      market_code: "sparta",
      category_code: "lighting-decor",
      gtin: null,
      mpn: "BR-01",
      model: "BR-01",
      condition: "new",
      variant_attributes: { finish: "brass" },
      warranty_basis: "EU consumer warranty",
      platform_price_minor: "5900",
      currency: "EUR",
      tax_rate_bps: 2400,
      active: true,
      suppressed: false,
      recalled: false,
      created_at: new Date("2026-08-14T09:00:00Z"),
      updated_at: new Date("2026-08-14T09:00:00Z"),
      title_el: "Μπρούτζινο Φωτιστικό",
      title_en: "Brass Lamp",
      description_el: "Τοπικά διαθέσιμο"
    }]
  });
  const repository = new PostgresCatalogRepository(client);
  const product = await repository.canonical("11111111-1111-4111-8111-111111111111");
  assert.equal(product?.id, "cv-lamp-public");
  assert.equal(product?.marketId, "sparta");
  assert.equal(product?.titleEl, "Μπρούτζινο Φωτιστικό");
  assert.equal(product?.platformPrice.minor, 5900);
  assert.deepEqual(product?.identity.attributes, { finish: "brass" });
  assert.equal(client.calls[0].params[0], "11111111-1111-4111-8111-111111111111");
});



test("catalog repository accepts market code and returns public IDs across vendor boundaries", async () => {
  const client = new RecordingClient();
  client.responses.push({
    rowCount: 1,
    rows: [{
      id: "11111111-1111-4111-8111-111111111111",
      public_id: "cv-public-1",
      market_id: "22222222-2222-4222-8222-222222222222",
      market_code: "sparta",
      category_code: "lighting-decor",
      gtin: null, mpn: "L-1", model: "L-1", condition: "new", variant_attributes: {}, warranty_basis: null,
      platform_price_minor: 4900, currency: "EUR", tax_rate_bps: 2400, active: true, suppressed: false, recalled: false,
      created_at: new Date("2026-08-14T09:00:00Z"), updated_at: new Date("2026-08-14T09:00:00Z"),
      title_el: "Φωτιστικό", title_en: "Lamp", description_el: null
    }]
  });
  const repository = new PostgresCatalogRepository(client);
  const products = await repository.listCanonicals({ marketId: "sparta", activeOnly: true });
  assert.equal(products[0]?.id, "cv-public-1");
  assert.equal(products[0]?.marketId, "sparta");
  assert.equal(client.calls[0].params[0], "sparta");
  assert.match(client.calls[0].text, /m\.code = \$1 OR cv\.market_id::text = \$1/);

  client.responses.push({
    rowCount: 1,
    rows: [{
      id: "33333333-3333-4333-8333-333333333333",
      public_id: "vps-public-1",
      market_id: "22222222-2222-4222-8222-222222222222", market_code: "sparta",
      vendor_id: "44444444-4444-4444-8444-444444444444", vendor_public_id: "vendor-demo-a",
      location_id: "55555555-5555-4555-8555-555555555555", location_public_id: "location-demo-a",
      category_code: "lighting-decor", source_identity: { title: "Lamp", model: "L-1", condition: "new", attributes: {} },
      supplier_unit_price_minor: 3000, currency: "EUR", supplier_tax_rate_bps: 2400, stock_on_hand: 5, safety_stock: 1,
      fulfilment_modes: ["pickup", "shipping"], advice_available: true, source: "manual", source_payload: {}, status: "linked",
      canonical_variant_id: "11111111-1111-4111-8111-111111111111", canonical_public_id: "cv-public-1", rejection_reason: null,
      created_at: new Date("2026-08-14T09:00:00Z"), updated_at: new Date("2026-08-14T09:00:00Z")
    }]
  });
  const submission = await repository.vendorSubmission("vps-public-1", "vendor-demo-a");
  assert.equal(submission?.id, "vps-public-1");
  assert.equal(submission?.identity.id, "vps-public-1");
  assert.equal(submission?.marketId, "sparta");
  assert.equal(submission?.vendorId, "vendor-demo-a");
  assert.equal(submission?.locationId, "location-demo-a");
  assert.equal(submission?.canonicalVariantId, "cv-public-1");
});

test("catalog draft creation resolves relational UUIDs but returns domain-facing public IDs", async () => {
  const client = new RecordingClient();
  client.responses.push({
    rowCount: 1,
    rows: [{
      id: "66666666-6666-4666-8666-666666666666", public_id: "vps-created-public",
      market_id: "22222222-2222-4222-8222-222222222222", market_code: "sparta",
      vendor_id: "44444444-4444-4444-8444-444444444444", vendor_public_id: "vendor-demo-a",
      location_id: "55555555-5555-4555-8555-555555555555", location_public_id: "location-demo-a",
      vendor_sku: "SKU-1", category_code: "lighting-decor",
      source_identity: { title: "Lamp", model: "L-2", condition: "new", attributes: { finish: "olive" } },
      supplier_unit_price_minor: 3200, currency: "EUR", supplier_tax_rate_bps: 2400, stock_on_hand: 4, safety_stock: 1,
      fulfilment_modes: ["pickup"], advice_available: true, source: "manual", source_payload: {}, status: "draft",
      canonical_variant_id: null, canonical_public_id: null, rejection_reason: null,
      created_at: new Date("2026-08-14T09:00:00Z"), updated_at: new Date("2026-08-14T09:00:00Z")
    }]
  });
  const repository = new PostgresCatalogRepository(client);
  const draft = await repository.createVendorDraft({
    marketId: "sparta", vendorId: "vendor-demo-a", locationId: "location-demo-a", createdBy: "user-catalog-a", vendorSku: "SKU-1",
    categoryCode: "lighting-decor", identity: { id: "source-temp", title: "Lamp", model: "L-2", condition: "new", attributes: { finish: "olive" } },
    supplierUnitPriceMinor: 3200, supplierTaxRateBps: 2400, stockOnHand: 4, safetyStock: 1, fulfilmentModes: ["pickup"], adviceAvailable: true, source: "manual"
  });
  assert.equal(draft.id, "vps-created-public");
  assert.equal(draft.identity.id, "vps-created-public");
  assert.equal(draft.marketId, "sparta");
  assert.equal(draft.vendorId, "vendor-demo-a");
  assert.equal(draft.locationId, "location-demo-a");
  assert.match(client.calls[0].text, /WITH inserted AS/);
  assert.match(client.calls[0].text, /COALESCE\(v\.public_id, v\.id::text\) AS vendor_public_id/);
  assert.equal(client.calls[0].params[2], "sparta");
  assert.equal(client.calls[0].params[3], "vendor-demo-a");
});

test("inventory repository calls database reservation function inside scoped transaction", async () => {
  const client = new RecordingClient();
  // BEGIN + statement timeout + lock timeout + five scope settings + reserve_stock + COMMIT.
  for (let index = 0; index < 8; index += 1) client.responses.push({ rows: [], rowCount: 0 });
  client.responses.push({
    rowCount: 1,
    rows: [{
      id: "33333333-3333-4333-8333-333333333333",
      checkout_key: "checkout-1",
      offer_id: "44444444-4444-4444-8444-444444444444",
      quantity: 2,
      status: "active",
      created_at: new Date("2026-08-14T09:00:00Z"),
      expires_at: new Date("2026-08-14T09:10:00Z")
    }]
  });
  client.responses.push({ rows: [], rowCount: 0 });
  const repository = new PostgresInventoryRepository(poolWith(client));
  const reservation = await repository.reserve({
    scope: { vendorId: "55555555-5555-4555-8555-555555555555" },
    marketId: "22222222-2222-4222-8222-222222222222",
    checkoutKey: "checkout-1",
    offerId: "44444444-4444-4444-8444-444444444444",
    quantity: 2,
    now: Date.parse("2026-08-14T09:00:00Z"),
    expiresAt: Date.parse("2026-08-14T09:10:00Z")
  });
  assert.equal(reservation.quantity, 2);
  assert.equal(reservation.status, "active");
  assert.equal(client.calls.some((call) => call.text.includes("reserve_stock")), true);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("pg adapter normalizes rowCount and releases connected client", async () => {
  let released = false;
  const adapted = adaptPgPool({
    async query() { return { rows: [{ ok: true }], rowCount: null }; },
    async connect() {
      return {
        async query() { return { rows: [{ tx: true }], rowCount: 1 }; },
        release() { released = true; }
      };
    }
  });
  const direct = await adapted.query("SELECT 1");
  assert.equal(direct.rowCount, 1);
  const connected = await adapted.connect();
  const tx = await connected.query("SELECT 2");
  assert.equal(tx.rowCount, 1);
  connected.release();
  assert.equal(released, true);
});
