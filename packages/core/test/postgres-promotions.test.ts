import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPromotionsRepository, money, type SqlPool, type SqlQueryResult, type SqlRow } from "../src/index.ts";

class Client {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  #uuid = 0;
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    if (/SELECT id::text AS id FROM/i.test(text)) {
      this.#uuid += 1;
      return { rowCount: 1, rows: [{ id: `00000000-0000-4000-8000-${String(this.#uuid).padStart(12,"0")}` }] as Row[] };
    }
    return { rowCount: /^\s*INSERT/i.test(text) ? 1 : 0, rows: [] as Row[] };
  }
  release() {}
}
function pool(client: Client): SqlPool { return { connect: async () => client, query: async <Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []) => client.query<Row>(text, params) }; }

test("Postgres promotions repository persists append-only platform price history and campaign snapshot", async () => {
  const client = new Client();
  const repo = new PostgresPromotionsRepository(pool(client));
  await repo.savePriceHistory({ scope: { actorUserId: "admin-public" }, entry: { id: "price-public", marketId: "sparta", canonicalVariantId: "product-public", price: money(12_900), effectiveAt: 1000, recordedAt: 1000, actorId: "admin-public", reason: "Initial price", source: "initial" } });
  await repo.savePromotion({ scope: { actorUserId: "admin-public" }, promotion: { id: "promo-public", marketId: "sparta", canonicalVariantId: "product-public", name: "Launch", promotionalPrice: money(10_900), startsAt: 2000, endsAt: 3000, priority: 0, version: 1, reason: "Launch offer", createdBy: "admin-public", createdAt: 1500, priorPriceSnapshot: money(12_900) } });
  assert.equal(client.calls.some((call) => /INSERT INTO platform_price_history/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /INSERT INTO product_promotions/i.test(call.text) && call.params.includes(12900)), true);
  assert.equal(client.calls.some((call) => /set_config/i.test(call.text) && call.params.includes("app.platform_access") && call.params.includes("true")), true);
});

test("Postgres coupon persistence stores eligibility and one-way subject hash rather than raw customer key", async () => {
  const client = new Client();
  const repo = new PostgresPromotionsRepository(pool(client));
  await repo.saveCouponRule({ scope: { actorUserId: "admin-public" }, rule: { id: "coupon-public", marketId: "sparta", code: "LOCAL10", name: "Local 10", discountType: "percentage", rateBps: 1000, minSubtotal: money(1000), maxDiscount: money(2000), eligibleCanonicalVariantIds: ["product-public"], eligibleCategoryCodes: ["mobile-telecom-electronics"], excludePrivateOffers: true, excludePromotionalPrices: false, startsAt: 1000, maxRedemptions: 50, maxPerSubject: 1, version: 1, active: true, createdBy: "admin-public", createdAt: 900 } });
  const saved = await repo.saveCouponRedemption({ scope: {}, redemption: { id: "redemption-public", couponId: "coupon-public", code: "LOCAL10", ruleVersion: 1, orderId: "order-public", subjectKey: "customer-private-123", discount: money(1290), redeemedAt: 2000 } });
  assert.equal(saved, true);
  assert.equal(client.calls.some((call) => /coupon_product_eligibility/i.test(call.text)), true);
  assert.equal(client.calls.some((call) => /coupon_category_eligibility/i.test(call.text)), true);
  const redemption = client.calls.find((call) => /INSERT INTO coupon_redemptions/i.test(call.text));
  assert.ok(redemption);
  assert.equal(redemption.params.includes("customer-private-123"), false);
  const hashed = redemption.params.find((value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value as string));
  assert.ok(hashed);
  assert.equal(client.calls.some((call) => /SERIALIZABLE/i.test(call.text)), true);
  const reversed = await repo.saveCouponRedemptionReversal({ scope: {}, reversal: { id: "reversal-public", redemptionId: "redemption-public", couponId: "coupon-public", orderId: "order-public", reason: "Cancelled before capture", reversedAt: 2100 } });
  assert.equal(reversed, true);
  assert.equal(client.calls.some((call) => /INSERT INTO coupon_redemption_reversals/i.test(call.text)), true);
});
