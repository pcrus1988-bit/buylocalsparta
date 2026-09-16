import { getProductionPostgresRuntime } from "./postgres-runtime";

const MARKET_CODE = "sparta";
const ATHENS_TIMEZONE = "Europe/Athens";
const FLASH_DISCOUNT_RATE = 0.20;
const MIN_PRICE_MINOR = 10_000;
const MAX_PRICE_MINOR = 50_000;

function integer(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function targetFlashUnitMinor(currentUnitMinor: number, promisedFlashMinor: number): number {
  const currentTwentyPercentOff = currentUnitMinor - Math.round(currentUnitMinor * FLASH_DISCOUNT_RATE);
  return Math.min(promisedFlashMinor, currentTwentyPercentOff);
}

export type ActiveFlashCartPricing = Readonly<{
  canonicalVariantId: string;
  regularPriceMinor: number;
  flashPriceMinor: number;
  quantityCap: 1;
  expiresAt: string;
}>;

/**
 * Returns only claims that remain safe to honour right now. The catalogue price remains
 * authoritative; this is an account-bound presentation overlay for one claimed unit.
 */
export async function activeFlashCartPricing(
  customerPublicId: string,
  canonicalVariantIds: readonly string[]
): Promise<ReadonlyMap<string, ActiveFlashCartPricing>> {
  const ids = [...new Set(canonicalVariantIds.map((value) => value.trim()).filter(Boolean))];
  if (!ids.length) return new Map();

  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query(`
    SELECT
      cv.public_id AS canonical_variant_id,
      fc.flash_price_minor AS promised_flash_price_minor,
      fc.expires_at,
      vo.customer_price_minor,
      vo.msrp_minor,
      dso.supplier_cost_minor
    FROM flash_sale_claims fc
    JOIN users u ON u.id=fc.user_id
    JOIN markets m ON m.id=fc.market_id
    JOIN canonical_variants cv ON cv.id=fc.canonical_variant_id
    JOIN vendor_offers vo ON vo.id=fc.offer_id AND vo.canonical_variant_id=cv.id
    JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    WHERE u.public_id=$1
      AND m.code=$2
      AND cv.public_id=ANY($3::text[])
      AND fc.redeemed_order_id IS NULL
      AND fc.expires_at > now()
      AND fc.sale_date=(now() AT TIME ZONE $4)::date
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor BETWEEN $5 AND $6
      AND vo.msrp_minor > 0
      AND vo.customer_price_minor <= vo.msrp_minor * 0.40
      AND dso.active=true
      AND dso.cached_available=true
      AND dso.cached_quantity IS DISTINCT FROM 0
      AND (dso.availability_expires_at IS NULL OR dso.availability_expires_at > now())
      AND dso.supplier_cost_minor IS NOT NULL
    ORDER BY fc.created_at DESC
  `, [customerPublicId, MARKET_CODE, ids, ATHENS_TIMEZONE, MIN_PRICE_MINOR, MAX_PRICE_MINOR]);

  const pricing = new Map<string, ActiveFlashCartPricing>();
  for (const row of result.rows) {
    const canonicalVariantId = String(row.canonical_variant_id);
    if (pricing.has(canonicalVariantId)) continue;
    const regularPriceMinor = integer(row.customer_price_minor, "customer price");
    const promisedFlashMinor = integer(row.promised_flash_price_minor, "promised Flash price");
    const supplierCostMinor = integer(row.supplier_cost_minor, "supplier cost");
    const flashPriceMinor = targetFlashUnitMinor(regularPriceMinor, promisedFlashMinor);
    if (flashPriceMinor <= supplierCostMinor || flashPriceMinor >= regularPriceMinor) continue;
    pricing.set(canonicalVariantId, {
      canonicalVariantId,
      regularPriceMinor,
      flashPriceMinor,
      quantityCap: 1,
      expiresAt: new Date(row.expires_at).toISOString()
    });
  }
  return pricing;
}

/**
 * Consumes valid one-unit Flash claims after the authoritative order has selected its offer.
 * The order line keeps the normal retail unit price; the Flash amount is represented as a
 * platform-funded discount so supplier settlement and the underlying catalogue stay intact.
 */
export async function applyFlashSaleClaimsToOrder(customerPublicId: string, orderPublicId: string): Promise<number> {
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    const orderResult = await client.query(`
      SELECT o.id::text AS order_uuid, o.status, u.id::text AS user_uuid, m.id::text AS market_uuid
      FROM customer_orders o
      JOIN users u ON u.id=o.user_id
      JOIN markets m ON m.id=o.market_id
      WHERE o.public_id=$1
        AND u.public_id=$2
        AND m.code=$3
      FOR UPDATE OF o
    `, [orderPublicId, customerPublicId, MARKET_CODE]);
    if (!orderResult.rows.length) throw new Error("FLASH_SALE_ORDER_NOT_FOUND");
    if (!["pending_payment", "authorised"].includes(String(orderResult.rows[0].status))) {
      await client.query("COMMIT");
      return 0;
    }

    const orderUuid = String(orderResult.rows[0].order_uuid);
    const userUuid = String(orderResult.rows[0].user_uuid);
    const marketUuid = String(orderResult.rows[0].market_uuid);
    const claimResult = await client.query(`
      SELECT
        fc.id::text AS claim_uuid,
        fc.public_id AS claim_public_id,
        fc.flash_price_minor AS promised_flash_price_minor,
        ol.id::text AS line_uuid,
        ol.retail_unit_price_minor,
        ol.quantity,
        ol.tax_rate_bps,
        COALESCE(ol.discount_allocation_minor,0) AS existing_discount_minor,
        vo.customer_price_minor,
        vo.msrp_minor,
        dso.supplier_cost_minor
      FROM flash_sale_claims fc
      JOIN order_lines ol
        ON ol.order_id=$1
       AND ol.canonical_variant_id=fc.canonical_variant_id
       AND ol.assigned_offer_id=fc.offer_id
      JOIN canonical_variants cv ON cv.id=fc.canonical_variant_id
      JOIN vendor_offers vo ON vo.id=fc.offer_id AND vo.canonical_variant_id=cv.id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=fc.offer_id
      WHERE fc.user_id=$2
        AND fc.market_id=$3
        AND fc.redeemed_order_id IS NULL
        AND fc.expires_at > now()
        AND fc.sale_date=(now() AT TIME ZONE $4)::date
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor BETWEEN $5 AND $6
        AND vo.msrp_minor > 0
        AND vo.customer_price_minor <= vo.msrp_minor * 0.40
        AND dso.active=true
        AND dso.cached_available=true
        AND dso.cached_quantity IS DISTINCT FROM 0
        AND (dso.availability_expires_at IS NULL OR dso.availability_expires_at > now())
        AND dso.supplier_cost_minor IS NOT NULL
      FOR UPDATE OF fc, ol
    `, [orderUuid, userUuid, marketUuid, ATHENS_TIMEZONE, MIN_PRICE_MINOR, MAX_PRICE_MINOR]);

    let totalDiscountMinor = 0;
    for (const row of claimResult.rows) {
      const currentUnitMinor = integer(row.retail_unit_price_minor, "order retail price");
      const promisedFlashMinor = integer(row.promised_flash_price_minor, "promised Flash price");
      const supplierCostMinor = integer(row.supplier_cost_minor, "supplier cost");
      const quantity = integer(row.quantity, "order quantity");
      const taxRateBps = integer(row.tax_rate_bps, "tax rate");
      const existingDiscountMinor = integer(row.existing_discount_minor, "existing line discount");
      const targetUnitMinor = targetFlashUnitMinor(currentUnitMinor, promisedFlashMinor);
      const discountMinor = Math.max(0, currentUnitMinor - targetUnitMinor);

      // The claim discounts one unit only. Keep both the claimed unit and the final line
      // (after any pre-existing promotion) strictly above the fresh supplier procurement cost.
      if (discountMinor <= 0 || targetUnitMinor <= supplierCostMinor) continue;
      const lineGrossMinor = currentUnitMinor * quantity;
      const discountedGrossMinor = Math.max(0, lineGrossMinor - existingDiscountMinor - discountMinor);
      const supplierCostTotalMinor = supplierCostMinor * quantity;
      if (discountedGrossMinor <= supplierCostTotalMinor) continue;

      const taxMinor = taxRateBps > 0
        ? Math.max(0, discountedGrossMinor - Math.round(discountedGrossMinor * 10_000 / (10_000 + taxRateBps)))
        : 0;

      await client.query(`
        UPDATE order_lines
        SET
          discount_allocation_minor=COALESCE(discount_allocation_minor,0)+$1,
          platform_discount_minor=COALESCE(platform_discount_minor,0)+$1,
          tax_minor=$2,
          discount_funding_snapshot=COALESCE(discount_funding_snapshot,'{}'::jsonb)
            || jsonb_build_object('flashSale', jsonb_build_object(
              'claimId',$3::text,
              'quantity',1,
              'platformFundedMinor',$1::bigint,
              'targetUnitMinor',$4::bigint
            ))
        WHERE id=$5
      `, [discountMinor, taxMinor, String(row.claim_public_id), targetUnitMinor, row.line_uuid]);

      await client.query(`
        UPDATE flash_sale_claims
        SET redeemed_order_id=$1, redeemed_at=now()
        WHERE id=$2 AND redeemed_order_id IS NULL
      `, [orderUuid, row.claim_uuid]);

      totalDiscountMinor += discountMinor;
    }

    if (totalDiscountMinor > 0) {
      await client.query(`
        UPDATE customer_orders o
        SET
          discount_minor=COALESCE(discount_minor,0)+$1,
          total_minor=GREATEST(0,total_minor-$1),
          tax_minor=COALESCE((SELECT sum(tax_minor) FROM order_lines WHERE order_id=o.id),0),
          updated_at=now()
        WHERE id=$2
      `, [totalDiscountMinor, orderUuid]);
    }

    await client.query("COMMIT");
    return totalDiscountMinor;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
