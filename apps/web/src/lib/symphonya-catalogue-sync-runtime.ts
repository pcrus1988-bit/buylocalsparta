import { createHash, randomUUID } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { SymphonyaHttpTransport } from "../../../../integrations/dropship-suppliers/src/symphonya-http.ts";
import type { SymphonyaSourceProduct } from "../../../../integrations/dropship-suppliers/src/symphonya-v1.ts";
import {
  normalizeSymphonyaProduct,
  type SymphonyaSourceEvidence
} from "../../../../integrations/dropship-suppliers/src/symphonya-normalize.ts";

const SOURCE_CODE = "symphonya";
const SUPPLIER_CODE = "symphonya";
const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES_PER_SLICE = 10;
const LEASE_MS = 55_000;
const SLICE_MS = 47_000;
const AVAILABILITY_TTL_MINUTES = 10;

type SymphonyaSyncState = {
  version: 1;
  cycleId: string;
  cycleStartedAt: string;
  nextPage: number;
  perPage: number;
  pagesCompleted: number;
  productsObserved: number;
  cycleCompletedAt?: string;
  lastSuccessfulAt?: string;
  lastSuccessfulPage?: number;
  lastError?: string | null;
  leaseUntil?: string | null;
};

export type SymphonyaSyncSliceResult = Readonly<{
  claimed: boolean;
  cycleId?: string;
  pages?: number;
  products?: number;
  nextPage?: number;
  cycleComplete?: boolean;
  message?: string;
}>;

export function symphonyaApiKeyFromEnvironment(): string {
  const value = process.env.SYMPHONYA_API_KEY?.trim();
  if (!value) throw new Error("SYMPHONYA_API_KEY is required for Symphonya catalogue sync");
  return value;
}

export async function runSymphonyaCatalogueSyncSlice(): Promise<SymphonyaSyncSliceResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const claimed = await pool.query<SqlRow>(`
    UPDATE public.catalog_sources cs
       SET metadata=jsonb_set(
             COALESCE(cs.metadata,'{}'::jsonb),
             '{symphonyaSync}',
             COALESCE(cs.metadata->'symphonyaSync','{}'::jsonb)
               || jsonb_build_object(
                    'leaseUntil', now() + interval '55 seconds',
                    'lastAttemptAt', now()
                  ),
             true
           ),
           updated_at=now()
     WHERE cs.code=$1
       AND cs.active=true
       AND EXISTS (
         SELECT 1
           FROM public.dropship_suppliers ds
          WHERE ds.catalog_source_id=cs.id
            AND ds.code=$2
            AND ds.active=true
            AND ds.catalogue_sync_enabled=true
       )
       AND (
         NULLIF(cs.metadata #>> '{symphonyaSync,leaseUntil}','') IS NULL
         OR (cs.metadata #>> '{symphonyaSync,leaseUntil}')::timestamptz < now()
       )
    RETURNING cs.id, cs.metadata
  `, [SOURCE_CODE, SUPPLIER_CODE]);

  const claimedRow = claimed.rows[0];
  if (!claimedRow) return { claimed: false, message: "disabled_or_busy" };

  const sourceId = String(claimedRow.id);
  let state = parseState((claimedRow.metadata as Record<string, unknown> | undefined)?.symphonyaSync, new Date());
  state.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  state.lastError = null;
  await saveState(sourceId, state);

  const client = new SymphonyaHttpTransport({
    apiKey: symphonyaApiKeyFromEnvironment(),
    baseUrl: process.env.SYMPHONYA_API_BASE_URL,
    requestTimeoutMs: positiveInteger(process.env.SYMPHONYA_REQUEST_TIMEOUT_MS, 20_000)
  });

  const deadline = Date.now() + SLICE_MS;
  let pages = 0;
  let products = 0;
  let cycleComplete = false;

  try {
    while (Date.now() < deadline && pages < maxPagesPerSlice()) {
      const pageNumber = state.nextPage;
      const page = await client.getProducts({
        page: pageNumber,
        limit: state.perPage,
        lang: "en",
        includeOutOfStock: true,
        includeDescription: true
      });

      const enrichedProducts = await enrichWithProductDetails(client, page.products);
      await persistProductPage({
        sourceId,
        state,
        pageNumber,
        products: enrichedProducts
      });

      pages += 1;
      products += enrichedProducts.length;
      state.pagesCompleted += 1;
      state.productsObserved += enrichedProducts.length;
      state.lastSuccessfulAt = new Date().toISOString();
      state.lastSuccessfulPage = pageNumber;
      state.nextPage = pageNumber + 1;
      cycleComplete = !page.hasMore;

      if (cycleComplete) {
        state.cycleCompletedAt = state.lastSuccessfulAt;
        await persistCompletedCycleSummary(sourceId, state);
        state = newCycleState(new Date(), state.perPage);
      }

      await saveState(sourceId, state);
      if (cycleComplete) break;
    }

    state.leaseUntil = null;
    await saveState(sourceId, state);
    return {
      claimed: true,
      cycleId: state.cycleId,
      pages,
      products,
      nextPage: state.nextPage,
      cycleComplete
    };
  } catch (error) {
    state.lastError = safeError(error);
    state.leaseUntil = null;
    await saveState(sourceId, state).catch(() => undefined);
    await recordSupplierHealth(false, safeError(error)).catch(() => undefined);
    throw error;
  }
}

async function enrichWithProductDetails(
  client: SymphonyaHttpTransport,
  products: readonly SymphonyaSourceProduct[]
): Promise<readonly SymphonyaSourceProduct[]> {
  if (!products.length) return products;
  const detailById = new Map<string, SymphonyaSourceProduct>();
  for (let index = 0; index < products.length; index += 50) {
    const ids = products.slice(index, index + 50).map((product) => product.productId);
    const details = await client.getProductDetails({ productIds: ids, lang: "en" });
    for (const detail of details) detailById.set(detail.productId, detail);
  }
  return products.map((product) => mergeSymphonyaProductDetail(product, detailById.get(product.productId)));
}

export function mergeSymphonyaProductDetail(
  product: SymphonyaSourceProduct,
  detail: SymphonyaSourceProduct | undefined
): SymphonyaSourceProduct {
  if (!detail) return product;
  return {
    ...product,
    name: detail.name ?? product.name,
    localizedNameEl: detail.localizedNameEl ?? product.localizedNameEl,
    descriptionEn: detail.descriptionEn ?? product.descriptionEn,
    howToUseEn: detail.howToUseEn ?? product.howToUseEn,
    raw: {
      ...product.raw,
      productDetails: detail.raw
    }
  };
}

async function persistProductPage(input: Readonly<{
  sourceId: string;
  state: SymphonyaSyncState;
  pageNumber: number;
  products: readonly SymphonyaSourceProduct[];
}>): Promise<void> {
  const payloadText = JSON.stringify(input.products.map((product) => product.raw));
  const snapshotId = await persistSnapshot({
    sourceId: input.sourceId,
    sourceHash: createHash("sha256").update(payloadText).digest("hex"),
    filename: `symphonya-products-cycle-${input.state.cycleId}-page-${input.pageNumber}.json`,
    version: "symphonya-api-v1:full",
    rowCount: input.products.length,
    metadata: {
      provider: "symphonya_public_api",
      cycleId: input.state.cycleId,
      cycleStartedAt: input.state.cycleStartedAt,
      page: input.pageNumber,
      limit: input.state.perPage,
      includeOutOfStock: true,
      includeDescription: true,
      pimLanguage: "en",
      localisationSource: "getProductDetails",
      priceMeaning: "wholesale_buying_cost"
    }
  });

  const evidence = input.products.map((product) => normalizeSymphonyaProduct(product));
  await insertEvidenceBatch(snapshotId, input.sourceId, evidence);
  await refreshExistingOfferAvailability(evidence);
  await recordSupplierHealth(true, null);
}

async function persistSnapshot(input: Readonly<{
  sourceId: string;
  sourceHash: string;
  filename: string;
  version: string;
  rowCount: number;
  metadata: Readonly<Record<string, unknown>>;
}>): Promise<string> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const inserted = await pool.query<SqlRow>(`
    INSERT INTO public.catalog_source_snapshots(
      source_id,source_filename,source_hash,source_version,observed_at,row_count,metadata
    ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT (source_id,source_hash) DO NOTHING
    RETURNING id
  `, [
    input.sourceId,
    input.filename,
    input.sourceHash,
    input.version,
    new Date().toISOString(),
    input.rowCount,
    JSON.stringify(input.metadata)
  ]);

  let snapshotId = inserted.rows[0]?.id ? String(inserted.rows[0].id) : "";
  if (!snapshotId) {
    const existing = await pool.query<SqlRow>(
      `SELECT id FROM public.catalog_source_snapshots WHERE source_id=$1 AND source_hash=$2`,
      [input.sourceId, input.sourceHash]
    );
    snapshotId = existing.rows[0]?.id ? String(existing.rows[0].id) : "";
  }
  if (!snapshotId) throw new Error("Symphonya source snapshot could not be resolved");
  return snapshotId;
}

async function insertEvidenceBatch(
  snapshotId: string,
  sourceId: string,
  evidence: readonly SymphonyaSourceEvidence[]
): Promise<void> {
  if (!evidence.length) return;
  const rows = evidence.map((item) => ({
    source_product_key: item.sourceProductKey,
    supplier_code: item.supplierCode,
    title: item.title,
    source_image_url: item.sourceImageUrl,
    source_identity: item.sourceIdentity,
    raw_payload: item.rawPayload,
    normalized_payload: item.normalizedPayload,
    quality_payload: item.qualityPayload,
    price_state: item.priceState,
    classification_status: item.classificationStatus
  }));

  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO public.catalog_source_products(
      snapshot_id,source_id,source_product_key,supplier_code,title,source_image_url,
      source_identity,raw_payload,normalized_payload,quality_payload,price_state,classification_status
    )
    SELECT
      $1::uuid,$2::uuid,x.source_product_key,NULLIF(x.supplier_code,''),x.title,NULLIF(x.source_image_url,''),
      x.source_identity,x.raw_payload,x.normalized_payload,x.quality_payload,x.price_state,x.classification_status
      FROM jsonb_to_recordset($3::jsonb) AS x(
        source_product_key text,
        supplier_code text,
        title text,
        source_image_url text,
        source_identity jsonb,
        raw_payload jsonb,
        normalized_payload jsonb,
        quality_payload jsonb,
        price_state text,
        classification_status text
      )
    ON CONFLICT (snapshot_id,source_product_key) DO NOTHING
  `, [snapshotId, sourceId, JSON.stringify(rows)]);
}

async function refreshExistingOfferAvailability(evidence: readonly SymphonyaSourceEvidence[]): Promise<void> {
  const variants = evidence.flatMap((item) => {
    const payload = item.normalizedPayload as Record<string, unknown>;
    const rawVariants = Array.isArray(payload.variants) ? payload.variants : [];
    return rawVariants.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const variant = value as Record<string, unknown>;
      const externalVariantId = scalarText(variant.externalVariantId);
      if (!externalVariantId) return [];
      const price = record(payload.prices);
      const stock = record(payload.stock);
      return [{
        external_product_id: item.sourceProductKey,
        external_variant_id: externalVariantId,
        external_sku: scalarText(variant.sku),
        ean: scalarText(variant.barcode),
        supplier_cost_minor: nullableInteger(price.buyingCostMinor),
        supplier_currency: scalarText(price.currency) ?? "EUR",
        warehouse_code: scalarText(stock.warehouse),
        cached_available: variant.available === true,
        cached_quantity: nullableInteger(variant.stockQuantity),
        source_content_hash: item.sourceContentHash,
        availability_payload: {
          source: "symphonya_catalogue_sync",
          stockStatus: scalarText(variant.stockStatus),
          manageStock: variant.manageStock ?? null,
          inStock: variant.inStock ?? null,
          backordersAllowed: false,
          sourceContentHash: item.sourceContentHash
        }
      }];
    });
  });
  if (!variants.length) return;

  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.dropship_supplier_offers dso
       SET external_sku=COALESCE(x.external_sku,dso.external_sku),
           ean=COALESCE(x.ean,dso.ean),
           supplier_cost_minor=COALESCE(x.supplier_cost_minor,dso.supplier_cost_minor),
           supplier_currency=COALESCE(x.supplier_currency,dso.supplier_currency),
           warehouse_code=COALESCE(x.warehouse_code,dso.warehouse_code),
           cached_available=CASE
             WHEN COALESCE(dso.availability_payload->>'priceHeld','false')='true' THEN false
             ELSE x.cached_available
           END,
           cached_quantity=CASE
             WHEN COALESCE(dso.availability_payload->>'priceHeld','false')='true' THEN 0
             ELSE x.cached_quantity
           END,
           availability_checked_at=now(),
           availability_expires_at=now() + make_interval(mins => $3::int),
           last_catalogue_sync_at=now(),
           availability_payload=COALESCE(dso.availability_payload,'{}'::jsonb)
             || x.availability_payload,
           updated_at=now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        external_product_id text,
        external_variant_id text,
        external_sku text,
        ean text,
        supplier_cost_minor bigint,
        supplier_currency char(3),
        warehouse_code text,
        cached_available boolean,
        cached_quantity integer,
        source_content_hash text,
        availability_payload jsonb
      ), public.dropship_suppliers ds
     WHERE ds.id=dso.supplier_id
       AND ds.code=$2
       AND dso.external_product_id=x.external_product_id
       AND dso.external_variant_id=x.external_variant_id
  `, [JSON.stringify(variants), SUPPLIER_CODE, AVAILABILITY_TTL_MINUTES]);
}

async function persistCompletedCycleSummary(sourceId: string, state: SymphonyaSyncState): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(
             COALESCE(metadata,'{}'::jsonb),
             '{symphonyaLastCompletedCycle}',
             $2::jsonb,
             true
           ),
           updated_at=now()
     WHERE id=$1::uuid
  `, [sourceId, JSON.stringify({
    cycleId: state.cycleId,
    startedAt: state.cycleStartedAt,
    completedAt: state.cycleCompletedAt ?? new Date().toISOString(),
    pages: state.pagesCompleted,
    productsObserved: state.productsObserved,
    includesOutOfStock: true,
    descriptions: "en",
    localisation: "supplier_candidates"
  })]);
}

async function saveState(sourceId: string, state: SymphonyaSyncState): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
       SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{symphonyaSync}',$2::jsonb,true),
           updated_at=now()
     WHERE id=$1::uuid
  `, [sourceId, JSON.stringify(state)]);
}

async function recordSupplierHealth(ok: boolean, error: string | null): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.dropship_suppliers
       SET last_healthcheck_at=now(),
           last_healthcheck_ok=$2,
           configuration=CASE
             WHEN $3::text IS NULL THEN configuration - 'lastHealthError'
             ELSE jsonb_set(COALESCE(configuration,'{}'::jsonb),'{lastHealthError}',to_jsonb($3::text),true)
           END,
           updated_at=now()
     WHERE code=$1
  `, [SUPPLIER_CODE, ok, error]);
}

function parseState(value: unknown, now: Date): SymphonyaSyncState {
  const input = record(value);
  const currentCycleId = scalarText(input.cycleId);
  const cycleStartedAt = validIso(input.cycleStartedAt);
  if (!currentCycleId || !cycleStartedAt) return newCycleState(now, DEFAULT_PER_PAGE);
  return {
    version: 1,
    cycleId: currentCycleId,
    cycleStartedAt,
    nextPage: positiveIntegerValue(input.nextPage, 1),
    perPage: Math.min(100, positiveIntegerValue(input.perPage, DEFAULT_PER_PAGE)),
    pagesCompleted: nonNegativeInteger(input.pagesCompleted, 0),
    productsObserved: nonNegativeInteger(input.productsObserved, 0),
    cycleCompletedAt: validIso(input.cycleCompletedAt) ?? undefined,
    lastSuccessfulAt: validIso(input.lastSuccessfulAt) ?? undefined,
    lastSuccessfulPage: nullableInteger(input.lastSuccessfulPage) ?? undefined,
    lastError: typeof input.lastError === "string" ? input.lastError.slice(0, 500) : null,
    leaseUntil: validIso(input.leaseUntil)
  };
}

function newCycleState(now: Date, perPage: number): SymphonyaSyncState {
  return {
    version: 1,
    cycleId: randomUUID(),
    cycleStartedAt: now.toISOString(),
    nextPage: 1,
    perPage: Math.min(100, Math.max(1, perPage)),
    pagesCompleted: 0,
    productsObserved: 0,
    lastError: null,
    leaseUntil: null
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function scalarText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function nullableInteger(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return nullableInteger(value) ?? fallback;
}

function positiveIntegerValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Symphonya runtime integer setting must be positive");
  return parsed;
}

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function maxPagesPerSlice(): number {
  const value = Number(process.env.SYMPHONYA_SYNC_MAX_PAGES_PER_SLICE ?? DEFAULT_MAX_PAGES_PER_SLICE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(25, value) : DEFAULT_MAX_PAGES_PER_SLICE;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}
