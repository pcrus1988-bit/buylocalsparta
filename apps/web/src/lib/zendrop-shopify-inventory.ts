import {
  getShopifyBridgeVariantInventories,
  shopifyVariantGid
} from "./shopify-zendrop-bridge";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_LIMIT = 100;
const STOCK_TTL_MS = 12 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 60 * 60 * 1000;

export type ZendropShopifyInventorySweepResult = Readonly<{
  enabled: boolean;
  checked: number;
  updated: number;
  failed: number;
}>;

type Target = Readonly<{
  mapping_id: string;
  supplier_offer_id: string;
  external_variant_id: string;
  shopify_variant_id: string;
}>;

/**
 * Refreshes KONTA MOY's Zendrop availability cache from the hidden Shopify
 * bridge. Per marketplace policy, Shopify ProductVariant.inventoryQuantity is
 * treated as the authoritative supplier stock for a mapped Zendrop variant.
 */
export async function runZendropShopifyInventorySweep(
  now = Date.now(),
  limit = DEFAULT_LIMIT
): Promise<ZendropShopifyInventorySweepResult> {
  if (!productionDatabaseConfigured()) {
    return { enabled: false, checked: 0, updated: 0, failed: 0 };
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Zendrop Shopify inventory limit must be between 1 and 100");
  }

  const runtime = getProductionPostgresRuntime();
  const staleBefore = new Date(now - REFRESH_AFTER_MS);
  const targets = await runtime.nativePool.query<Target>(`
    SELECT bridge.id::text AS mapping_id,
           dso.id::text AS supplier_offer_id,
           bridge.external_variant_id,
           bridge.shopify_variant_id
      FROM public.dropship_shopify_bridge_variants bridge
      JOIN public.dropship_suppliers ds
        ON ds.id=bridge.supplier_id
       AND ds.code='zendrop'
       AND ds.active=true
       AND ds.configuration->>'shopifyInventoryAuthoritative'='true'
      JOIN public.dropship_supplier_offers dso
        ON dso.supplier_id=bridge.supplier_id
       AND dso.external_variant_id=bridge.external_variant_id
     WHERE bridge.sync_status='synced'
       AND dso.active=true
       AND (dso.availability_checked_at IS NULL OR dso.availability_checked_at <= $1)
     ORDER BY dso.availability_checked_at NULLS FIRST,bridge.updated_at,bridge.id
     LIMIT $2
  `, [staleBefore, limit]);

  if (!targets.rowCount) {
    return { enabled: true, checked: 0, updated: 0, failed: 0 };
  }

  const inventories = await getShopifyBridgeVariantInventories(
    targets.rows.map((target) => target.shopify_variant_id)
  );
  const byId = new Map(inventories.map((inventory) => [inventory.id, inventory]));

  let updated = 0;
  let failed = 0;

  for (const target of targets.rows) {
    const inventory = byId.get(shopifyVariantGid(target.shopify_variant_id));
    if (!inventory) {
      failed += 1;
      await runtime.nativePool.query(`
        UPDATE public.dropship_shopify_bridge_variants
           SET last_error=$2,updated_at=$3
         WHERE id=$1::uuid
      `, [
        target.mapping_id,
        "Shopify bridge inventory lookup did not return this mapped variant",
        new Date(now)
      ]);
      continue;
    }

    const checkedAt = new Date(now);
    const expiresAt = new Date(now + STOCK_TTL_MS);
    await runtime.nativePool.query(`
      WITH offer_update AS (
        UPDATE public.dropship_supplier_offers
           SET cached_available=$2,
               cached_quantity=$3,
               availability_checked_at=$4,
               availability_expires_at=$5,
               availability_payload=$6::jsonb,
               updated_at=$4
         WHERE id=$1::uuid
         RETURNING id
      )
      UPDATE public.dropship_shopify_bridge_variants
         SET supplier_offer_id=$1::uuid,
             last_error=NULL,
             metadata=metadata || $7::jsonb,
             synced_at=$4,
             updated_at=$4
       WHERE id=$8::uuid
         AND EXISTS (SELECT 1 FROM offer_update)
    `, [
      target.supplier_offer_id,
      inventory.inventoryQuantity > 0,
      inventory.inventoryQuantity,
      checkedAt,
      expiresAt,
      JSON.stringify({
        authority: "shopify_bridge",
        syntheticInventoryAcceptedAsSupplierStock: true,
        shopifyVariantId: inventory.id,
        inventoryQuantity: inventory.inventoryQuantity,
        tracked: inventory.tracked,
        checkedAt: checkedAt.toISOString(),
        expiresAt: expiresAt.toISOString()
      }),
      JSON.stringify({
        lastInventoryAuthority: "shopify_bridge",
        lastInventoryQuantity: inventory.inventoryQuantity,
        lastInventoryCheckedAt: checkedAt.toISOString()
      }),
      target.mapping_id
    ]);
    updated += 1;
  }

  return { enabled: true, checked: targets.rows.length, updated, failed };
}
