import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime.ts";
import { normalizeNovaProduct } from "../../../../integrations/dropship-suppliers/src/nova-normalize.ts";
import {
  NovaV1ApiError,
  NovaV1Client,
  novaApiKeyFromEnvironment,
  type NovaProduct
} from "../../../../integrations/dropship-suppliers/src/nova-v1.ts";

const NOVA_SUPPLIER_CODE = "nova_brandsgateway";
const AVAILABILITY_TTL_HOURS = 2;
const DEFAULT_AVAILABILITY_REQUESTS_PER_MINUTE = 20;
const RATE_LIMIT_BACKOFF_MS = [5_000, 10_000, 20_000, 30_000] as const;

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
 *
 * Production has demonstrated provider throttling below the generic client maximum, so this
 * path deliberately uses a conservative request rate and bounded 429 backoff. A throttled
 * product remains stale rather than being treated as available without fresh provider evidence.
 */
export async function runNovaAvailabilityRefreshSweep(): Promise<NovaAvailabilityRefreshResult> {
  const db = getProductionPostgresRuntime().sqlPool;
  const source = await db.query<SqlRow>(`
    SELECT COALESCE(
      metadata #>> '{novaSync,storeId}',
      metadata ->> 'storeId',
      '2'
    ) AS store_id
    FROM public.catalog_sources
    WHERE code='nova-brandsgateway'
    LIMIT 1
  `);
  const storeId = text(source.rows[0]?.store_id) || "2";

  const productResult = await db.query<SqlRow>(`
    SELECT DISTINCT dso.external_product_id
    FROM public.dropship_supplier_offers dso
    JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
    WHERE ds.code=$1
      AND ds.active=true
      AND ds.api_authoritative_availability=true
      AND dso.active=true
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND dso.external_product_id IS NOT NULL
    ORDER BY dso.external_product_id
  `, [NOVA_SUPPLIER_CODE]);
  const productIds = productResult.rows
    .map((row) => text(row.external_product_id))
    .filter((value): value is string => Boolean(value));

  const client = new NovaV1Client({
    apiKey: novaApiKeyFromEnvironment(),
    requestsPerMinute: novaAvailabilityRequestsPerMinute()
  });
  let refreshedProducts = 0;
  let failedProducts = 0;
  let updatedOffers = 0;

  for (const externalProductId of productIds) {
    try {
      const supplierProduct = await getProductWithRateLimitBackoff(client, storeId, externalProductId);
      const normalized = normalizeNovaProduct(supplierProduct, storeId);
      const variants = availabilityVariants(normalized.normalizedPayload.variants);
      if (variants.length === 0) throw new Error("Nova product returned no normalized variants");

      const checkedAt = new Date();
      for (const variant of variants) {
        const update = await db.query<SqlRow>(`
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
                'refreshPolicy', 'hourly_full_sweep_2h_ttl_rate_limited'
              ),
              updated_at=$6
          FROM public.dropship_suppliers ds
          WHERE ds.id=dso.supplier_id
            AND ds.code=$1
            AND ds.api_authoritative_availability=true
            AND dso.active=true
            AND dso.external_product_id=$2
            AND (
              dso.external_variant_id=$3
              OR ($7::text IS NOT NULL AND dso.external_sku=$7)
            )
        `, [
          NOVA_SUPPLIER_CODE,
          externalProductId,
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
        externalProductId,
        error: safeError(error),
        at: new Date().toISOString()
      }));
    }
  }

  return {
    attemptedProducts: productIds.length,
    refreshedProducts,
    failedProducts,
    updatedOffers
  };
}

export function novaAvailabilityRequestsPerMinute(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.BLS_NOVA_AVAILABILITY_REQUESTS_PER_MINUTE ?? DEFAULT_AVAILABILITY_REQUESTS_PER_MINUTE);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 60
    ? parsed
    : DEFAULT_AVAILABILITY_REQUESTS_PER_MINUTE;
}

async function getProductWithRateLimitBackoff(
  client: NovaV1Client,
  storeId: string,
  externalProductId: string
): Promise<NovaProduct> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.getProduct(storeId, externalProductId, "en");
    } catch (error) {
      if (!(error instanceof NovaV1ApiError) || error.status !== 429 || attempt >= RATE_LIMIT_BACKOFF_MS.length) {
        throw error;
      }
      await delay(RATE_LIMIT_BACKOFF_MS[attempt]);
    }
  }
}

function availabilityVariants(value: unknown): readonly AvailabilityVariant[] {
  if (!Array.isArray(value)) return [];
  const variants: AvailabilityVariant[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const externalVariantId = text(record.externalVariantId);
    if (!externalVariantId || typeof record.available !== "boolean") continue;
    variants.push({
      externalVariantId,
      sku: text(record.sku),
      stockQuantity: typeof record.stockQuantity === "number" && Number.isFinite(record.stockQuantity)
        ? record.stockQuantity
        : null,
      available: record.available
    });
  }
  return variants;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeError(error: unknown): string {
  if (error instanceof NovaV1ApiError) {
    return `${error.name}:${error.status}:${error.message}`.slice(0, 500);
  }
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
