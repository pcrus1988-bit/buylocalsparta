import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCategoryGovernanceRepository, type SqlPool, type SqlQueryResult, type SqlRow } from "../src/index.ts";

class Client {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/FROM categories c LEFT JOIN category_translations/i.test(text)) return { rowCount: 1, rows: [{ id: "cat-uuid", code: "mobile_telecom", slug: "mobile-telecom-electronics", commerce_mode: "compatibility_sensitive", require_compatibility_confirmation: true, regulated_checkout_allowed: false, counteroffer_allowed: true, advice_allowed: true, checkout_fulfilment_modes: ["pickup","shipping"], label: "Κινητά & Ηλεκτρονικά" }] as Row[] };
    if (/FROM category_attributes ca JOIN attribute_definitions/i.test(text)) return { rowCount: 2, rows: [
      { code: "colour", data_type: "enum", unit: null, variant_identity: true, filterable: true, values: ["white","black"], required: true, sort_order: 10, label: "Χρώμα" },
      { code: "connector", data_type: "enum", unit: null, variant_identity: true, filterable: true, values: ["USB-C","Lightning"], required: true, sort_order: 20, label: "Σύνδεση" }
    ] as Row[] };
    return { rowCount: 0, rows: [] as Row[] };
  }
  release() {}
}
function pool(client: Client): SqlPool { return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) }; }

test("Postgres category governance reads data-driven commerce policy and attribute schema", async () => {
  const client = new Client();
  const repo = new PostgresCategoryGovernanceRepository(pool(client));
  const result = await repo.category({ scope: { marketId: "sparta" }, marketId: "sparta", categoryCodeOrSlug: "mobile-telecom-electronics", locale: "el" });
  assert.equal(result.policy.commerceMode, "compatibility_sensitive");
  assert.equal(result.policy.requireCompatibilityConfirmation, true);
  assert.deepEqual(result.policy.checkoutFulfilmentModes, ["pickup","shipping"]);
  assert.equal(result.schema.attributes[0].labelEl, "Χρώμα");
  assert.equal(result.schema.attributes[1].required, true);
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params[0] === "app.platform_access" && call.params[1] === "true"), true);
});

test("Postgres category governance writes policy and attribute bindings through platform-scoped transaction", async () => {
  const client = new Client();
  const original = client.query.bind(client);
  client.query = async function<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT c\.id::text FROM categories c JOIN markets/i.test(text)) return { rowCount: 1, rows: [{ id: "cat-uuid" }] as Row[] };
    if (/SELECT code FROM attribute_definitions/i.test(text)) return { rowCount: 2, rows: [{ code: "colour" }, { code: "connector" }] as Row[] };
    if (/FROM categories c LEFT JOIN category_translations/i.test(text)) return { rowCount: 1, rows: [{ id: "cat-uuid", code: "mobile_telecom", slug: "mobile-telecom-electronics", commerce_mode: "compatibility_sensitive", require_compatibility_confirmation: true, regulated_checkout_allowed: false, counteroffer_allowed: true, advice_allowed: true, checkout_fulfilment_modes: ["pickup","shipping"], label: "Κινητά & Ηλεκτρονικά" }] as Row[] };
    if (/FROM category_attributes ca JOIN attribute_definitions/i.test(text)) return { rowCount: 2, rows: [
      { code: "colour", data_type: "enum", unit: null, variant_identity: true, filterable: true, values: ["white","black"], required: true, sort_order: 10, label: "Χρώμα" },
      { code: "connector", data_type: "enum", unit: null, variant_identity: true, filterable: true, values: ["USB-C","Lightning"], required: true, sort_order: 20, label: "Σύνδεση" }
    ] as Row[] };
    return { rowCount: 1, rows: [] as Row[] };
  } as typeof client.query;
  const repo = new PostgresCategoryGovernanceRepository(pool(client));
  const saved = await repo.savePolicy({
    scope: { marketId: "sparta", actorId: "admin-public" }, marketId: "sparta", categoryCodeOrSlug: "mobile-telecom-electronics",
    policy: { categoryCode: "mobile-telecom-electronics", labelEl: "Κινητά & Ηλεκτρονικά", commerceMode: "compatibility_sensitive", requireCompatibilityConfirmation: true, checkoutFulfilmentModes: ["pickup","shipping"], attributes: [{ attributeCode: "colour", required: true, sortOrder: 10 }, { attributeCode: "connector", required: true, sortOrder: 20 }] }
  });
  assert.equal(saved.policy.commerceMode, "compatibility_sensitive");
  assert.equal(client.calls.some((call) => /UPDATE categories SET commerce_mode/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /DELETE FROM category_attributes/i.test(call.text)), true);
  assert.equal(client.calls.filter((call) => /INSERT INTO category_attributes/i.test(call.text)).length, 2);
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params[0] === "app.platform_access" && call.params[1] === "true"), true);
});
