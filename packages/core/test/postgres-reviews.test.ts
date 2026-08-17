import test from "node:test";
import assert from "node:assert/strict";
import { PostgresReviewRepository, type Review, type SqlPool, type SqlQueryResult, type SqlRow, type VendorReviewResponse } from "../src/index.ts";

class ReviewClient {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM (markets|users|vendor_businesses|canonical_variants|customer_orders|order_lines|conversations|appointments|reviews)/i.test(text)) {
      return { rowCount: 1, rows: [{ id: "00000000-0000-4000-8000-000000000001" }] as Row[] };
    }
    if (/SELECT r\.public_id,m\.code AS market_code/i.test(text)) {
      return { rowCount: 1, rows: [{
        public_id: "review-1", market_code: "sparta", vendor_public_id: "vendor-1", canonical_public_id: "cv-1",
        order_public_id: "order-1", order_line_public_id: "line-1", conversation_public_id: null, appointment_public_id: null,
        interaction_type: "verified_order", rating: 5, body: "Excellent help", incentive_type: "none", incentive_details: null,
        status: "published", published_at: new Date(1000), created_at: new Date(1000), updated_at: new Date(1000),
        response_public_id: "response-1", response_actor_public_id: "vendor-user", response_body: "Thank you",
        response_created_at: new Date(1100), response_updated_at: new Date(1100)
      }] as Row[] };
    }
    return { rowCount: /^\s*(INSERT|UPDATE)/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}

function pool(client: ReviewClient): SqlPool {
  return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) };
}

const review: Review = {
  id: "review-1", marketId: "sparta", customerId: "customer-1", vendorId: "vendor-1", canonicalVariantId: "cv-1",
  interactionType: "verified_order", orderId: "order-1", orderLineId: "line-1", rating: 5, body: "Excellent help",
  incentiveType: "none", status: "published", createdAt: 1000, updatedAt: 1000, publishedAt: 1000
};

test("Postgres review persistence writes customer review under customer RLS rather than platform bypass", async () => {
  const client = new ReviewClient();
  const repo = new PostgresReviewRepository(pool(client));
  await repo.saveReview({ scope: {}, review });
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.actor_user_id") && call.params.includes("customer-1")), true);
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.platform_access") && call.params.includes("false")), true);
  assert.equal(client.calls.some((call) => /INSERT INTO reviews/i.test(call.text)), true);
});

test("Postgres vendor review response remains vendor scoped", async () => {
  const client = new ReviewClient();
  const repo = new PostgresReviewRepository(pool(client));
  const response: VendorReviewResponse = { id: "response-1", reviewId: "review-1", vendorId: "vendor-1", actorId: "vendor-user", body: "Thank you", createdAt: 1100, updatedAt: 1100 };
  await repo.saveResponse({ scope: {}, response });
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.vendor_id") && call.params.includes("vendor-1")), true);
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.platform_access") && call.params.includes("false")), true);
});

test("Postgres public review projection omits customer identity and includes verified label and vendor response", async () => {
  const client = new ReviewClient();
  const repo = new PostgresReviewRepository(pool(client));
  const [item] = await repo.publicByProduct("cv-1");
  assert.equal(item.authorLabel, "Verified buyer");
  assert.equal("customerId" in item, false);
  assert.equal(item.response?.body, "Thank you");
  assert.equal(client.calls.some((call) => /r\.status='published'/i.test(call.text)), true);
});
