import { getProductionPostgresRuntime } from "./postgres-runtime.ts";
import { normalizeNovaProduct } from "../../../../integrations/dropship-suppliers/src/nova-normalize.ts";
import { NovaV1Client, novaApiKeyFromEnvironment } from "../../../../integrations/dropship-suppliers/src/nova-v1.ts";

const NOVA_SUPPLIER_CODE = "nova_brandsgateway";
const AVAILABILITY_TTL_HOURS = 2;

type ProductRow = Readonly<{ external_product_id: string }>;
type SourceRow = Readonly<{ store_id: string }>;
type AvailabilityVariant = Readonly<{
  externalVariantId: string;
  sku: string | null;
  stockQuantity: number | null;
  available: boolean;
}>;

export type NovaAvailabilityRefreshResult = Readonly<{
  attemptedProducts: number;
  refreshedProducts: number;
  failedProducts: number;
  updatedOffers: number;
}>;

/**
 * Refresh the full set of currently public NOVA/BrandsGateway products.
 *
 * This sweep is intentionally independent from the incremental catalogue cursor: a product
 * does not need to have changed upstream for its stock assertion to remain fresh. A successful
 * supplier fetch receives a two-hour validity window; failed fetches never extend stale stock.
 */
export async function runNovaAvailabilityRefreshSweep(): Promise<NovaAvailabilityRefreshResult> {
  const db = getProductionPostgresRuntime().sqlPool;
  const source = await db.query<SourceRow>(`
    SELECT COALESCE(
      metadata #>> '{novaSync,storeId}',
      metadata ->> 'storeId',
      '2'
    ) AS store_id
    FROM public.catalog_sources
    WHERE code='nova-brandsgateway'
    LIMIT 1
  `);
  const storeId = source.rows[0]?.store_id?.trim() || "2";

  const products = await db.query<ProductRow>(`
    SELECT DISTINCT dso.external_product_id
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    WHERE ds.code=$1
      AND ds.active=true
      AND dso.active=true
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND dso.external_product_id IS NOT NULL
    ORDER BY dso.external_product_id
  `, [NOVA_SUPPLIER_CODE]);

  const client = new NovaV1Client({ apiKey: novaApiKeyFromEnvironment() });
  let refreshedProducts = 0;
  let failedProducts = 0;
  let updatedOffers = 0;

  for (const row of products.rows) {
    try {
      const supplierProduct = await client.getProduct(storeId, row.external_product_id, "en");
      const normalized = normalizeNovaProduct(supplierProduct, storeId);
      const variants = availabilityVariants(normalized.normalizedPayload.variants);
      if (variants.length === 0) throw new Error("Nova product returned no normalized variants");

      const checkedAt = new Date();
      for (const variant of variants) {
        const update = await db.query(`
          UPDATE public.dropship_supplier_offers dso
          SET cached_available=$4,
              cached_quantity=$5,
              availability_checked_at=$6,
              availability_expires_at=$6::timestamptz + interval '${AVAILABILITY_TTL_HOURS} hours',
              availability_payload=COALESCE(dso.availability_payload, '{}'::jsonb) || jsonb_build_object(
                'source', 'nova_api_authoritative',
                'productId', $2,
                'variantId', $3,
                'refreshedAt', $6::timestamptz,
                'refreshPolicy', 'hourly_full_sweep_2h_ttl'
              ),
              last_seen_at=$6,
              updated_at=$6
          FROM public.dropship_suppliers ds
          WHERE ds.id=dso.supplier_id
            AND ds.code=$1
            AND dso.active=true
            AND dso.external_product_id=$2
            AND (
              dso.external_variant_id=$3
              OR ($7::text IS NOT NULL AND dso.external_sku=$7)
            )
        `, [
          NOVA_SUPPLIER_CODE,
          row.external_product_id,
          variant.externalVariantId,
          variant.available,
          variant.stockQuantity,
          checkedAt,
          variant.sku
        ]);
        updatedOffers += update.rowCount;
      }
      refreshedProducts += 1;
    } catch (error) {
      failedProducts += 1;
      console.error(JSON.stringify({
        level: "error",
        event: "nova.availability_product_refresh_failed",
        externalProductId: row.external_product_id,
        error: safeError(error),
        at: new Date().toISOString()
      }));
    }
  }

  return {
    attemptedProducts: products.rows.length,
    refreshedProducts,
    failedProducts,
    updatedOffers
  };
}

function availabilityVariants(value: unknown): readonly AvailabilityVariant[] {
  if (!Array.isArray(value)) return [];
  const variants: AvailabilityVariant[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const externalVariantId = typeof record.externalVariantId === "string" ? record.externalVariantId.trim() : "";
    if (!externalVariantId || typeof record.available !== "boolean") continue;
    variants.push({
      externalVariantId,
      sku: typeof record.sku === "string" && record.sku.trim() ? record.sku.trim() : null,
      stockQuantity: typeof record.stockQuantity === "number" && Number.isFinite(record.stockQuantity)
        ? record.stockQuantity
        : null,
      available: record.available
    });
  }
  return variants;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}
