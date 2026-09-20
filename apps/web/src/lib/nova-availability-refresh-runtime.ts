import type { SqlExecutor, SqlRow } from "@buy-local-sparta/core";
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
const DEFAULT_FULL_SWEEP_PAGE_SIZE = 100;
const FALLBACK_FULL_SWEEP_PAGE_SIZE = 50;
const RATE_LIMIT_BACKOFF_MS = [5_000, 10_000, 20_000, 30_000] as const;

type AvailabilityVariant = Readonly<{
  externalVariantId: string;
  sku: string | null;
  stockQuantity: number | null;
  available: boolean;
}>;

type AvailabilityPageRow = Readonly<{
  external_product_id: string;
  external_variant_id: string;
  external_sku: string | null;
  cached_available: boolean;
  cached_quantity: number | null;
}>;

export type NovaAvailabilityRefreshResult = Readonly<{
  attemptedProducts: number;
  refreshedProducts: number;
  failedProducts: number;
  updatedOffers: number;
}>;

export type NovaProductAvailabilityRefreshResult = Readonly<{
  externalProductId: string;
  updatedOffers: number;
}>;

export type NovaAvailabilityRefreshSliceResult = Readonly<{
  claimed: boolean;
  startPage: number;
  nextPage: number;
  pageSize: number;
  pagesProcessed: number;
  attemptedProducts: number;
  refreshedProducts: number;
  updatedOffers: number;
  cycleCompleted: boolean;
}>;

export function novaAvailabilityRequestsPerMinute(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.BLS_NOVA_AVAILABILITY_REQUESTS_PER_MINUTE ?? DEFAULT_AVAILABILITY_REQUESTS_PER_MINUTE);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 60
    ? parsed
    : DEFAULT_AVAILABILITY_REQUESTS_PER_MINUTE;
}

async function resolveNovaStoreId(
  db: SqlExecutor = getProductionPostgresRuntime().sqlPool
): Promise<string> {
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
  return text(source.rows[0]?.store_id) || "2";
}

function createNovaAvailabilityClient(): NovaV1Client {
  return new NovaV1Client({
    apiKey: novaApiKeyFromEnvironment(),
    requestsPerMinute: novaAvailabilityRequestsPerMinute()
  });
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

async function listProductsWithRateLimitBackoff(
  client: NovaV1Client,
  storeId: string,
  page: number,
  perPage: number
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.listProducts(storeId, { page, per_page: perPage, lang: "en" });
    } catch (error) {
      if (!(error instanceof NovaV1ApiError) || error.status !== 429 || attempt >= RATE_LIMIT_BACKOFF_MS.length) {
        throw error;
      }
      await delay(RATE_LIMIT_BACKOFF_MS[attempt]);
    }
  }
}

async function refreshNovaAvailabilityProductWithClient(
  client: NovaV1Client,
  storeId: string,
  externalProductId: string,
  ownerVendorId: string | null,
  refreshPolicy: string
): Promise<NovaProductAvailabilityRefreshResult> {
  const db = getProductionPostgresRuntime().sqlPool;
  const supplierProduct = await getProductWithRateLimitBackoff(client, storeId, externalProductId);
  const normalized = normalizeNovaProduct(supplierProduct, storeId);
  const variants = availabilityVariants(normalized.normalizedPayload.variants);
  if (variants.length === 0) throw new Error("Nova product returned no normalized variants");

  // Never create or extend supplier evidence until the authoritative provider fetch above succeeds.
  const checkedAt = new Date();
  let updatedOffers = 0;
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
            'refreshPolicy', $9::text
          ),
          updated_at=$6
      FROM public.dropship_suppliers ds
      WHERE ds.id=dso.supplier_id
        AND ds.code=$1
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND ($8::uuid IS NULL OR ds.owner_vendor_id=$8::uuid)
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
      variant.sku,
      ownerVendorId,
      refreshPolicy
    ]);
    updatedOffers += update.rowCount;
  }

  return { externalProductId, updatedOffers };
}

async function refreshNovaAvailabilityPage(
  products: readonly NovaProduct[],
  storeId: string,
  checkedAt: Date,
  db: SqlExecutor = getProductionPostgresRuntime().sqlPool
): Promise<number> {
  const rows: AvailabilityPageRow[] = products.flatMap((product) => {
    const normalized = normalizeNovaProduct(product, storeId);
    return availabilityVariants(normalized.normalizedPayload.variants).map((variant) => ({
      external_product_id: normalized.sourceProductKey,
      external_variant_id: variant.externalVariantId,
      external_sku: variant.sku,
      cached_available: variant.available,
      cached_quantity: variant.stockQuantity
    }));
  });
  if (rows.length === 0) return 0;

  const update = await db.query<SqlRow>(`
    UPDATE public.dropship_supplier_offers dso
    SET cached_available=x.cached_available,
        cached_quantity=x.cached_quantity,
        availability_checked_at=$3::timestamptz,
        availability_expires_at=$3::timestamptz + interval '${AVAILABILITY_TTL_HOURS} hours',
        availability_payload=COALESCE(dso.availability_payload, '{}'::jsonb) || jsonb_build_object(
          'source', 'nova_api_authoritative_full_catalogue',
          'productId', x.external_product_id,
          'variantId', x.external_variant_id,
          'refreshedAt', $3::timestamptz,
          'refreshPolicy', 'hourly_paginated_full_sweep_2h_ttl_rate_limited'
        ),
        updated_at=$3::timestamptz
    FROM jsonb_to_recordset($1::jsonb) AS x(
      external_product_id text,
      external_variant_id text,
      external_sku text,
      cached_available boolean,
      cached_quantity integer
    ), public.dropship_suppliers ds,
       public.vendor_offers vo
    WHERE ds.id=dso.supplier_id
      AND ds.code=$2
      AND ds.active=true
      AND ds.api_authoritative_availability=true
      AND vo.id=dso.vendor_offer_id
      AND vo.vendor_id=ds.owner_vendor_id
      AND dso.active=true
      AND dso.external_product_id=x.external_product_id
      AND (
        dso.external_variant_id=x.external_variant_id
        OR (x.external_sku IS NOT NULL AND dso.external_sku=x.external_sku)
      )
  `, [JSON.stringify(rows), NOVA_SUPPLIER_CODE, checkedAt]);

  return update.rowCount;
}

/**
 * Refresh the full NOVA/BrandsGateway offer inventory from Nova's official paginated
 * product API. Availability is supplier-authoritative and deliberately independent
 * from KONTA MOY approval/publication state: staged products may receive fresh stock
 * evidence, but this function never publishes them, changes customer prices, assigns
 * taxonomy, or relaxes any activation/suppression gate.
 *
 * A full page carries stock for many products, avoiding the previous N+1 product
 * refresh that could not keep a large dropshipping catalogue inside the two-hour TTL.
 * Failed provider requests never extend stale evidence. Existing offers are updated
 * only when they belong to the supplier's configured owner vendor.
 */
export async function runNovaAvailabilityRefreshSweep(): Promise<NovaAvailabilityRefreshResult> {
  const runtime = getProductionPostgresRuntime();
  const lockClient = await runtime.nativePool.connect();
  let claimed = false;
  try {
    const lock = await lockClient.query<{ claimed: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS claimed",
      ["kontamou:nova-availability-refresh"]
    );
    claimed = lock.rows[0]?.claimed === true;
    if (!claimed) {
      return { attemptedProducts: 0, refreshedProducts: 0, failedProducts: 0, updatedOffers: 0 };
    }
    return await runNovaAvailabilityRefreshSweepUnlocked(lockClient);
  } finally {
    if (claimed) {
      await lockClient.query(
        "SELECT pg_advisory_unlock(hashtext($1))",
        ["kontamou:nova-availability-refresh"]
      ).catch(() => undefined);
    }
    lockClient.release();
  }
}

async function runNovaAvailabilityRefreshSweepUnlocked(
  db: SqlExecutor
): Promise<NovaAvailabilityRefreshResult> {
  const storeId = await resolveNovaStoreId(db);
  const client = createNovaAvailabilityClient();
  let page = 1;
  let perPage = DEFAULT_FULL_SWEEP_PAGE_SIZE;
  let attemptedProducts = 0;
  let refreshedProducts = 0;
  let updatedOffers = 0;

  while (true) {
    let result;
    try {
      result = await listProductsWithRateLimitBackoff(client, storeId, page, perPage);
    } catch (error) {
      // Nova has historically rejected a requested page size of 100 in some account
      // configurations. Fall back once to the already-supported 50-product page size.
      if (page === 1 && perPage > FALLBACK_FULL_SWEEP_PAGE_SIZE && error instanceof NovaV1ApiError && error.status === 422) {
        perPage = FALLBACK_FULL_SWEEP_PAGE_SIZE;
        continue;
      }
      throw error;
    }

    if (result.items.length === 0) break;
    attemptedProducts += result.items.length;
    const checkedAt = new Date();
    updatedOffers += await refreshNovaAvailabilityPage(result.items, storeId, checkedAt, db);
    refreshedProducts += result.items.length;

    const pageComplete = result.items.length < perPage
      || (result.totalPages !== null && page >= result.totalPages);
    if (pageComplete) break;
    page += 1;
  }

  return {
    attemptedProducts,
    refreshedProducts,
    failedProducts: 0,
    updatedOffers
  };
}

/**
 * Vercel-safe failover for the NOVA availability worker.
 *
 * The cursor is stored in catalog_sources metadata so each short cron invocation
 * advances through the official paginated supplier feed without pretending stale
 * evidence is fresh. A shared advisory lock prevents overlap with the Railway full
 * sweep once that worker is healthy again.
 */
export async function runNovaAvailabilityRefreshSlice(
  requestedMaxPages = 14
): Promise<NovaAvailabilityRefreshSliceResult> {
  const maxPages = Number.isSafeInteger(requestedMaxPages) && requestedMaxPages > 0
    ? Math.min(requestedMaxPages, 20)
    : 14;
  const runtime = getProductionPostgresRuntime();
  const lockClient = await runtime.nativePool.connect();
  let claimed = false;

  try {
    const lock = await lockClient.query<{ claimed: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS claimed",
      ["kontamou:nova-availability-refresh"]
    );
    claimed = lock.rows[0]?.claimed === true;
    if (!claimed) {
      return {
        claimed: false,
        startPage: 1,
        nextPage: 1,
        pageSize: DEFAULT_FULL_SWEEP_PAGE_SIZE,
        pagesProcessed: 0,
        attemptedProducts: 0,
        refreshedProducts: 0,
        updatedOffers: 0,
        cycleCompleted: false
      };
    }

    const cursorResult = await lockClient.query<SqlRow>(`
      SELECT
        CASE
          WHEN COALESCE(metadata #>> '{novaAvailabilityFailover,nextPage}', '') ~ '^[0-9]+$'
            THEN GREATEST(1, (metadata #>> '{novaAvailabilityFailover,nextPage}')::int)
          ELSE 1
        END AS next_page,
        CASE
          WHEN COALESCE(metadata #>> '{novaAvailabilityFailover,pageSize}', '') ~ '^[0-9]+$'
            THEN GREATEST(1, (metadata #>> '{novaAvailabilityFailover,pageSize}')::int)
          ELSE $2::int
        END AS page_size
      FROM public.catalog_sources
      WHERE code=$1
      LIMIT 1
    `, ["nova-brandsgateway", DEFAULT_FULL_SWEEP_PAGE_SIZE]);

    if (cursorResult.rowCount !== 1) throw new Error("NOVA_CATALOG_SOURCE_NOT_FOUND");

    let page = Math.max(1, Number(cursorResult.rows[0]?.next_page ?? 1));
    let perPage = Math.max(1, Number(cursorResult.rows[0]?.page_size ?? DEFAULT_FULL_SWEEP_PAGE_SIZE));
    if (perPage !== DEFAULT_FULL_SWEEP_PAGE_SIZE && perPage !== FALLBACK_FULL_SWEEP_PAGE_SIZE) {
      perPage = DEFAULT_FULL_SWEEP_PAGE_SIZE;
    }

    const startPage = page;
    const storeId = await resolveNovaStoreId(lockClient);
    const client = createNovaAvailabilityClient();
    let pagesProcessed = 0;
    let attemptedProducts = 0;
    let refreshedProducts = 0;
    let updatedOffers = 0;
    let cycleCompleted = false;

    while (pagesProcessed < maxPages) {
      let result;
      try {
        result = await listProductsWithRateLimitBackoff(client, storeId, page, perPage);
      } catch (error) {
        if (perPage > FALLBACK_FULL_SWEEP_PAGE_SIZE && error instanceof NovaV1ApiError && error.status === 422) {
          const zeroBasedOffset = (page - 1) * perPage;
          perPage = FALLBACK_FULL_SWEEP_PAGE_SIZE;
          page = Math.floor(zeroBasedOffset / perPage) + 1;
          continue;
        }
        throw error;
      }

      if (result.items.length === 0) {
        page = 1;
        cycleCompleted = true;
        await persistNovaAvailabilityFailoverCursor(page, perPage, cycleCompleted, lockClient);
        break;
      }

      attemptedProducts += result.items.length;
      const checkedAt = new Date();
      updatedOffers += await refreshNovaAvailabilityPage(result.items, storeId, checkedAt, lockClient);
      refreshedProducts += result.items.length;
      pagesProcessed += 1;

      const pageComplete = result.items.length < perPage
        || (result.totalPages !== null && page >= result.totalPages);

      page = pageComplete ? 1 : page + 1;
      cycleCompleted = pageComplete;
      await persistNovaAvailabilityFailoverCursor(page, perPage, cycleCompleted, lockClient);
      if (pageComplete) break;
    }

    return {
      claimed: true,
      startPage,
      nextPage: page,
      pageSize: perPage,
      pagesProcessed,
      attemptedProducts,
      refreshedProducts,
      updatedOffers,
      cycleCompleted
    };
  } finally {
    if (claimed) {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", ["kontamou:nova-availability-refresh"])
        .catch(() => undefined);
    }
    lockClient.release();
  }
}

async function persistNovaAvailabilityFailoverCursor(
  nextPage: number,
  pageSize: number,
  cycleCompleted: boolean,
  db: SqlExecutor = getProductionPostgresRuntime().sqlPool
): Promise<void> {
  await db.query(`
    UPDATE public.catalog_sources
    SET metadata=jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{novaAvailabilityFailover}',
          COALESCE(metadata->'novaAvailabilityFailover', '{}'::jsonb)
            || jsonb_build_object(
              'nextPage', $2::int,
              'pageSize', $3::int,
              'lastRunAt', now(),
              'lastCycleCompleted', $4::boolean
            )
            || CASE
                 WHEN $4::boolean THEN jsonb_build_object('lastCompletedAt', now())
                 ELSE '{}'::jsonb
               END,
          true
        ),
        updated_at=now()
    WHERE code=$1
  `, ["nova-brandsgateway", nextPage, pageSize, cycleCompleted]);
}

/**
 * Refresh one NOVA product through the same authoritative supplier path used by the hourly sweep.
 * Intended for vendor-initiated recovery of missing/stale availability telemetry without running
 * a full catalogue sweep inside a web request. The owner id scopes the database write to the
 * authenticated vendor's supplier. This function does not publish products, change prices, place
 * supplier orders, or touch local inventory.
 */
export async function runNovaAvailabilityRefreshForProduct(
  externalProductId: string,
  ownerVendorId: string
): Promise<NovaProductAvailabilityRefreshResult> {
  const normalizedProductId = externalProductId.trim();
  const normalizedOwnerVendorId = ownerVendorId.trim();
  if (!normalizedProductId) throw new Error("NOVA_EXTERNAL_PRODUCT_ID_REQUIRED");
  if (!normalizedOwnerVendorId) throw new Error("NOVA_OWNER_VENDOR_ID_REQUIRED");
  const storeId = await resolveNovaStoreId();
  return refreshNovaAvailabilityProductWithClient(
    createNovaAvailabilityClient(),
    storeId,
    normalizedProductId,
    normalizedOwnerVendorId,
    "vendor_targeted_refresh_2h_ttl_rate_limited"
  );
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
