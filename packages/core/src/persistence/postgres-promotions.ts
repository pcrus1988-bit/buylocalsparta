import { createHash, randomUUID } from "node:crypto";
import type { CouponRedemption, CouponRedemptionReversal, CouponRule, PlatformPriceHistoryEntry, ProductPromotion } from "../promotions/types.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

async function marketUuid(db: SqlExecutor, marketId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code=$1 OR id::text=$1", [marketId]);
  return String(requireSingleRow(result, `Market ${marketId} was not found`).id);
}
async function publicUuid(db: SqlExecutor, table: "canonical_variants" | "customer_orders", value: string): Promise<string> {
  const result = await db.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE public_id=$1 OR id::text=$1`, [value]);
  return String(requireSingleRow(result, `${table} ${value} was not found`).id);
}
async function optionalUser(db: SqlExecutor, value?: string): Promise<string | null> {
  if (!value) return null;
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [value]);
  return result.rowCount === 1 ? String(result.rows[0].id) : null;
}
function subjectHash(subjectKey: string): string {
  return createHash("sha256").update(`buy-local-sparta:coupon-subject:v1:${subjectKey}`).digest("hex");
}

/** Production persistence contract for platform-controlled pricing and promotions. */
export class PostgresPromotionsRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async savePriceHistory(input: { scope: DatabaseScope; entry: PlatformPriceHistoryEntry }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.entry.marketId, platformAccess: true }, async (tx) => {
      const market = await marketUuid(tx, input.entry.marketId);
      const canonical = await publicUuid(tx, "canonical_variants", input.entry.canonicalVariantId);
      const actor = await optionalUser(tx, input.entry.actorId);
      await tx.query(`INSERT INTO platform_price_history
        (id,public_id,market_id,canonical_variant_id,currency,price_minor,effective_at,recorded_at,actor_id,actor_public_id,reason,source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (public_id) DO NOTHING`, [
        randomUUID(), input.entry.id, market, canonical, input.entry.price.currency, input.entry.price.minor,
        new Date(input.entry.effectiveAt), new Date(input.entry.recordedAt), actor, input.entry.actorId, input.entry.reason, input.entry.source
      ]);
    });
  }

  async savePromotion(input: { scope: DatabaseScope; promotion: ProductPromotion }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.promotion.marketId, platformAccess: true }, async (tx) => {
      const market = await marketUuid(tx, input.promotion.marketId);
      const canonical = await publicUuid(tx, "canonical_variants", input.promotion.canonicalVariantId);
      const createdBy = await optionalUser(tx, input.promotion.createdBy);
      const cancelledBy = await optionalUser(tx, input.promotion.cancelledBy);
      await tx.query(`INSERT INTO product_promotions
        (id,public_id,market_id,canonical_variant_id,name,currency,promotional_price_minor,starts_at,ends_at,priority,version,reason,created_by,created_by_public_id,created_at,prior_price_snapshot_minor,cancelled_at,cancelled_by,cancelled_by_public_id,cancellation_reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT(public_id) DO UPDATE SET prior_price_snapshot_minor=EXCLUDED.prior_price_snapshot_minor,
          cancelled_at=EXCLUDED.cancelled_at,cancelled_by=EXCLUDED.cancelled_by,cancelled_by_public_id=EXCLUDED.cancelled_by_public_id,cancellation_reason=EXCLUDED.cancellation_reason`, [
        randomUUID(), input.promotion.id, market, canonical, input.promotion.name, input.promotion.promotionalPrice.currency,
        input.promotion.promotionalPrice.minor, new Date(input.promotion.startsAt), new Date(input.promotion.endsAt), input.promotion.priority,
        input.promotion.version, input.promotion.reason, createdBy, input.promotion.createdBy, new Date(input.promotion.createdAt),
        input.promotion.priorPriceSnapshot?.minor ?? null, input.promotion.cancelledAt ? new Date(input.promotion.cancelledAt) : null,
        cancelledBy, input.promotion.cancelledBy ?? null, input.promotion.cancellationReason ?? null
      ]);
    });
  }

  async saveCouponRule(input: { scope: DatabaseScope; rule: CouponRule }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, marketId: input.rule.marketId, platformAccess: true }, async (tx) => {
      const market = await marketUuid(tx, input.rule.marketId);
      const createdBy = await optionalUser(tx, input.rule.createdBy);
      await tx.query(`INSERT INTO coupon_rules
        (id,public_id,market_id,code,name,discount_type,currency,fixed_amount_minor,rate_bps,min_subtotal_minor,max_discount_minor,exclude_private_offers,exclude_promotional_prices,starts_at,ends_at,max_redemptions,max_per_subject,version,active,created_by,created_by_public_id,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT(market_id,code,version) DO NOTHING`, [
        randomUUID(), input.rule.id, market, input.rule.code, input.rule.name, input.rule.discountType,
        input.rule.fixedAmount?.currency ?? input.rule.minSubtotal?.currency ?? input.rule.maxDiscount?.currency ?? "EUR",
        input.rule.fixedAmount?.minor ?? null, input.rule.rateBps ?? null, input.rule.minSubtotal?.minor ?? null,
        input.rule.maxDiscount?.minor ?? null, input.rule.excludePrivateOffers, input.rule.excludePromotionalPrices,
        new Date(input.rule.startsAt), input.rule.endsAt ? new Date(input.rule.endsAt) : null, input.rule.maxRedemptions ?? null,
        input.rule.maxPerSubject ?? null, input.rule.version, input.rule.active, createdBy, input.rule.createdBy, new Date(input.rule.createdAt)
      ]);
      const couponRow = requireSingleRow(await tx.query<SqlRow>("SELECT id::text AS id FROM coupon_rules WHERE market_id=$1 AND code=$2 AND version=$3", [market, input.rule.code, input.rule.version]));
      const couponUuid = String(couponRow.id);
      for (const canonicalPublicId of input.rule.eligibleCanonicalVariantIds ?? []) {
        const canonical = await publicUuid(tx, "canonical_variants", canonicalPublicId);
        await tx.query("INSERT INTO coupon_product_eligibility(coupon_id,canonical_variant_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [couponUuid, canonical]);
      }
      for (const categoryCode of input.rule.eligibleCategoryCodes ?? []) {
        const category = requireSingleRow(await tx.query<SqlRow>("SELECT id::text AS id FROM categories WHERE (market_id=$1 OR market_id IS NULL) AND (code=$2 OR slug=$2) ORDER BY market_id NULLS LAST LIMIT 1", [market, categoryCode]), `Category ${categoryCode} was not found`);
        await tx.query("INSERT INTO coupon_category_eligibility(coupon_id,category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [couponUuid, String(category.id)]);
      }
    });
  }

  async saveCouponRedemptionReversal(input: { scope: DatabaseScope; reversal: CouponRedemptionReversal }): Promise<boolean> {
    return this.#uow.withTransaction({ ...input.scope, platformAccess: true }, async (tx) => {
      const redemption = requireSingleRow(await tx.query<SqlRow>("SELECT id::text AS id FROM coupon_redemptions WHERE public_id=$1", [input.reversal.redemptionId]), "Coupon redemption not found");
      const result = await tx.query(`INSERT INTO coupon_redemption_reversals (id,public_id,redemption_id,reason,reversed_at)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT(redemption_id) DO NOTHING`, [randomUUID(), input.reversal.id, String(redemption.id), input.reversal.reason, new Date(input.reversal.reversedAt)]);
      return result.rowCount === 1;
    }, { isolation: "serializable" });
  }

  async saveCouponRedemption(input: { scope: DatabaseScope; redemption: CouponRedemption }): Promise<boolean> {
    return this.#uow.withTransaction({ ...input.scope, platformAccess: true }, async (tx) => {
      const coupon = requireSingleRow(await tx.query<SqlRow>("SELECT id::text AS id FROM coupon_rules WHERE public_id=$1 OR id::text=$1", [input.redemption.couponId]), "Coupon rule not found");
      const order = await publicUuid(tx, "customer_orders", input.redemption.orderId);
      const result = await tx.query(`INSERT INTO coupon_redemptions
        (id,public_id,coupon_id,order_id,subject_hash,rule_version,currency,discount_minor,redeemed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(order_id) DO NOTHING`, [
        randomUUID(), input.redemption.id, String(coupon.id), order, subjectHash(input.redemption.subjectKey), input.redemption.ruleVersion,
        input.redemption.discount.currency, input.redemption.discount.minor, new Date(input.redemption.redeemedAt)
      ]);
      return result.rowCount === 1;
    }, { isolation: "serializable" });
  }
}
