import { createHash } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  NovaV1ApiError,
  NovaV1Client,
  novaApiKeyFromEnvironment,
  type NovaProduct
} from "../../../../integrations/dropship-suppliers/src/nova-v1.ts";
import {
  normalizeNovaProduct,
  type NovaSourceEvidence
} from "../../../../integrations/dropship-suppliers/src/nova-normalize.ts";

const SOURCE_CODE = "nova-brandsgateway";
const SUPPLIER_CODE = "nova_brandsgateway";
const DEFAULT_STORE_ID = 2;
const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES_PER_SLICE = 40;
const LEASE_MS = 55_000;
const SLICE_MS = 47_000;
const OVERLAP_MS = 5 * 60_000;

type FilterPrecision = "timestamp" | "date";
type NovaSyncPhase = "bootstrap" | "delta" | "deleted";

type NovaSyncState = {
  version: 1;
  storeId: number;
  phase: NovaSyncPhase;
  nextPage: number;
  perPage: number;
  bootstrapStartedAt: string;
  bootstrapCompletedAt?: string;
  bootstrapTotal?: number | null;
  bootstrapComplete: boolean;
  deltaWatermark?: string;
  deltaWindowEnd?: string;
  deltaFilterPrecision?: FilterPrecision;
  deletedWatermark?: string;
  deletedWindowEnd?: string;
  deletedFilterPrecision?: FilterPrecision;
  lastSuccessfulAt?: string;
  lastSuccessfulPage?: number;
  lastError?: string | null;
  leaseUntil?: string | null;
};

export type NovaSyncSliceResult = Readonly<{
  claimed: boolean;
  phase?: NovaSyncPhase;
  pages?: number;
  products?: number;
  deleted?: number;
  nextPage?: number;
  bootstrapComplete?: boolean;
  total?: number | null;
  message?: string;
}>;

export async function runNovaCatalogueSyncSlice(): Promise<NovaSyncSliceResult> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const claimed = await pool.query<SqlRow>(`
    UPDATE public.catalog_sources cs
    SET metadata=jsonb_set(
          COALESCE(cs.metadata,'{}'::jsonb),
          '{novaSync}',
          COALESCE(cs.metadata->'novaSync','{}'::jsonb)
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
        NULLIF(cs.metadata #>> '{novaSync,leaseUntil}','') IS NULL
        OR (cs.metadata #>> '{novaSync,leaseUntil}')::timestamptz < now()
      )
    RETURNING cs.id,cs.metadata
  `, [SOURCE_CODE,SUPPLIER_CODE]);

  const claimedRow = claimed.rows[0];
  if (!claimedRow) return { claimed: false, message: "disabled_or_busy" };

  const sourceId = String(claimedRow.id);
  let state = parseState((claimedRow.metadata as Record<string, unknown> | undefined)?.novaSync, new Date());
  state.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  state.lastError = null;
  await saveState(sourceId,state);

  const deadline = Date.now() + SLICE_MS;
  let pages = 0;
  let products = 0;
  let deleted = 0;

  try {
    const client = new NovaV1Client({
      apiKey: novaApiKeyFromEnvironment(),
      baseUrl: process.env.NOVA_API_BASE_URL,
      requestsPerMinute: 60,
      requestTimeoutMs: 20_000
    });

    while (Date.now() < deadline && pages < maxPagesPerSlice()) {
      if (state.phase === "bootstrap") {
        const outcome = await runBootstrapPage(client,sourceId,state);
        state = outcome.state;
        pages += 1;
        products += outcome.products;
        await saveState(sourceId,state);
        if (outcome.complete) break;
        continue;
      }

      if (state.phase === "delta") {
        const outcome = await runDeltaPage(client,sourceId,state);
        state = outcome.state;
        pages += 1;
        products += outcome.products;
        await saveState(sourceId,state);
        if (outcome.complete) break;
        continue;
      }

      const outcome = await runDeletedPage(client,sourceId,state);
      state = outcome.state;
      pages += 1;
      deleted += outcome.deleted;
      await saveState(sourceId,state);
      if (outcome.complete) break;
    }

    state.leaseUntil = null;
    await saveState(sourceId,state);
    return {
      claimed: true,
      phase: state.phase,
      pages,
      products,
      deleted,
      nextPage: state.nextPage,
      bootstrapComplete: state.bootstrapComplete,
      total: state.bootstrapTotal ?? null
    };
  } catch (error) {
    state.lastError = safeError(error);
    state.leaseUntil = null;
    await saveState(sourceId,state).catch(() => undefined);
    throw error;
  }
}

async function runBootstrapPage(client: NovaV1Client, sourceId: string, state: NovaSyncState) {
  const pageNumber = state.nextPage;
  let page;
  try {
    page = await client.listProducts(state.storeId,{ page: pageNumber,per_page: state.perPage,lang: "en" });
  } catch (error) {
    if (pageNumber === 1 && state.perPage > 50 && error instanceof NovaV1ApiError && error.status === 422) {
      state.perPage = 50;
      return runBootstrapPage(client,sourceId,state);
    }
    throw error;
  }

  await persistProductPage({
    sourceId,state,pageNumber,mode: "bootstrap",products: page.items,total: page.total,totalPages: page.totalPages
  });
  const complete = pageComplete(page.items.length,state.perPage,pageNumber,page.totalPages);
  const completedAt = new Date().toISOString();
  state.lastSuccessfulAt = completedAt;
  state.lastSuccessfulPage = pageNumber;
  state.bootstrapTotal = page.total;
  state.nextPage = pageNumber + 1;
  if (complete) {
    state.bootstrapComplete = true;
    state.bootstrapCompletedAt = completedAt;
    state.phase = "delta";
    state.nextPage = 1;
    const firstWatermark = new Date(new Date(state.bootstrapStartedAt).getTime() - OVERLAP_MS).toISOString();
    state.deltaWatermark = firstWatermark;
    state.deletedWatermark = firstWatermark;
    state.deltaWindowEnd = undefined;
    state.deletedWindowEnd = undefined;
  }
  return { state,products: page.items.length,complete };
}

async function runDeltaPage(client: NovaV1Client, sourceId: string, state: NovaSyncState) {
  const now = new Date();
  if (!state.deltaWindowEnd) {
    state.deltaWindowEnd = now.toISOString();
    state.nextPage = 1;
  }
  const startIso = state.deltaWatermark ?? new Date(now.getTime() - OVERLAP_MS).toISOString();
  const endIso = state.deltaWindowEnd;
  const precision = state.deltaFilterPrecision ?? "timestamp";
  const updatedAtMin = filterDate(startIso,precision);
  const updatedAtMax = filterDate(endIso,precision);

  let page;
  try {
    page = await client.listProducts(state.storeId,{
      page: state.nextPage,
      per_page: state.perPage,
      lang: "en",
      updated_at_min: updatedAtMin,
      updated_at_max: updatedAtMax
    });
  } catch (error) {
    if (precision === "timestamp" && error instanceof NovaV1ApiError && error.status === 422) {
      state.deltaFilterPrecision = "date";
      return runDeltaPage(client,sourceId,state);
    }
    throw error;
  }

  const pageNumber = state.nextPage;
  await persistProductPage({
    sourceId,state,pageNumber,mode: "delta",products: page.items,total: page.total,totalPages: page.totalPages,
    windowStart: updatedAtMin,windowEnd: updatedAtMax
  });
  const complete = pageComplete(page.items.length,state.perPage,pageNumber,page.totalPages);
  state.lastSuccessfulAt = new Date().toISOString();
  state.lastSuccessfulPage = pageNumber;
  state.nextPage = pageNumber + 1;
  if (complete) {
    state.deltaWatermark = new Date(new Date(endIso).getTime() - OVERLAP_MS).toISOString();
    state.deltaWindowEnd = undefined;
    state.phase = "deleted";
    state.nextPage = 1;
  }
  return { state,products: page.items.length,complete };
}

async function runDeletedPage(client: NovaV1Client, sourceId: string, state: NovaSyncState) {
  const now = new Date();
  if (!state.deletedWindowEnd) {
    state.deletedWindowEnd = now.toISOString();
    state.nextPage = 1;
  }
  const startIso = state.deletedWatermark ?? new Date(now.getTime() - OVERLAP_MS).toISOString();
  const endIso = state.deletedWindowEnd;
  const precision = state.deletedFilterPrecision ?? "timestamp";
  const deletedAtMin = filterDate(startIso,precision);
  const deletedAtMax = filterDate(endIso,precision);

  let page;
  try {
    page = await client.listDeletedProducts(state.storeId,{
      page: state.nextPage,
      per_page: state.perPage,
      deleted_at_min: deletedAtMin,
      deleted_at_max: deletedAtMax
    });
  } catch (error) {
    if (precision === "timestamp" && error instanceof NovaV1ApiError && error.status === 422) {
      state.deletedFilterPrecision = "date";
      return runDeletedPage(client,sourceId,state);
    }
    throw error;
  }

  const pageNumber = state.nextPage;
  await persistDeletedPage({
    sourceId,state,pageNumber,items: page.items,total: page.total,totalPages: page.totalPages,
    windowStart: deletedAtMin,windowEnd: deletedAtMax
  });
  const complete = pageComplete(page.items.length,state.perPage,pageNumber,page.totalPages);
  state.lastSuccessfulAt = new Date().toISOString();
  state.lastSuccessfulPage = pageNumber;
  state.nextPage = pageNumber + 1;
  if (complete) {
    state.deletedWatermark = new Date(new Date(endIso).getTime() - OVERLAP_MS).toISOString();
    state.deletedWindowEnd = undefined;
    state.phase = "delta";
    state.nextPage = 1;
  }
  return { state,deleted: page.items.length,complete };
}

async function persistProductPage(input: {
  sourceId: string;
  state: NovaSyncState;
  pageNumber: number;
  mode: "bootstrap" | "delta";
  products: readonly NovaProduct[];
  total: number | null;
  totalPages: number | null;
  windowStart?: string;
  windowEnd?: string;
}) {
  if (!input.products.length) return;
  const payloadText = JSON.stringify(input.products);
  const snapshotId = await persistSnapshot({
    sourceId: input.sourceId,
    sourceHash: createHash("sha256").update(payloadText).digest("hex"),
    filename: `nova-products-${input.mode}-page-${input.pageNumber}.json`,
    version: `nova-shopwoo-v1:${input.mode}`,
    rowCount: input.products.length,
    metadata: {
      provider: "nova_shopwoo_v1",
      storeId: input.state.storeId,
      mode: input.mode,
      page: input.pageNumber,
      perPage: input.state.perPage,
      total: input.total,
      totalPages: input.totalPages,
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
      language: "en"
    }
  });
  const evidence = input.products.map((product) => normalizeNovaProduct(product,input.state.storeId));
  await insertEvidenceBatch(snapshotId,input.sourceId,evidence);
  await refreshExistingOfferAvailability(evidence);
}

async function persistDeletedPage(input: {
  sourceId: string;
  state: NovaSyncState;
  pageNumber: number;
  items: readonly Readonly<Record<string, unknown>>[];
  total: number | null;
  totalPages: number | null;
  windowStart: string;
  windowEnd: string;
}) {
  if (!input.items.length) return;
  const payloadText = JSON.stringify(input.items);
  await persistSnapshot({
    sourceId: input.sourceId,
    sourceHash: createHash("sha256").update(payloadText).digest("hex"),
    filename: `nova-products-deleted-page-${input.pageNumber}.json`,
    version: "nova-shopwoo-v1:deleted",
    rowCount: input.items.length,
    metadata: {
      provider: "nova_shopwoo_v1",
      storeId: input.state.storeId,
      mode: "deleted",
      page: input.pageNumber,
      perPage: input.state.perPage,
      total: input.total,
      totalPages: input.totalPages,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      deletedProducts: input.items
    }
  });

  const deletedProducts = input.items
    .map((item) => ({ external_product_id: scalarText(item.id),deleted_at: scalarText(item.deleted_at) }))
    .filter((item): item is { external_product_id: string; deleted_at: string | null } => Boolean(item.external_product_id));
  if (!deletedProducts.length) return;

  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.dropship_supplier_offers dso
    SET active=false,
        cached_available=false,
        cached_quantity=0,
        availability_checked_at=now(),
        availability_expires_at=NULL,
        last_catalogue_sync_at=now(),
        availability_payload=(COALESCE(dso.availability_payload,'{}'::jsonb) - 'reappearedAt')
          || jsonb_build_object(
            'withdrawnByDeletedFeed',true,
            'activeBeforeWithdrawal',dso.active,
            'deletedAt',x.deleted_at,
            'source','nova_deleted_feed'
          ),
        updated_at=now()
    FROM jsonb_to_recordset($1::jsonb) AS x(external_product_id text,deleted_at text),
         public.dropship_suppliers ds
    WHERE ds.id=dso.supplier_id
      AND ds.code=$2
      AND dso.external_product_id=x.external_product_id
  `,[JSON.stringify(deletedProducts),SUPPLIER_CODE]);
}

async function persistSnapshot(input: {
  sourceId: string;
  sourceHash: string;
  filename: string;
  version: string;
  rowCount: number;
  metadata: Readonly<Record<string, unknown>>;
}): Promise<string> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const inserted = await pool.query<SqlRow>(`
    INSERT INTO public.catalog_source_snapshots(
      source_id,source_filename,source_hash,source_version,observed_at,row_count,metadata
    ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT (source_id,source_hash) DO NOTHING
    RETURNING id
  `,[input.sourceId,input.filename,input.sourceHash,input.version,new Date().toISOString(),input.rowCount,JSON.stringify(input.metadata)]);

  let snapshotId = inserted.rows[0]?.id ? String(inserted.rows[0].id) : "";
  if (!snapshotId) {
    const existing = await pool.query<SqlRow>(
      `SELECT id FROM public.catalog_source_snapshots WHERE source_id=$1 AND source_hash=$2`,
      [input.sourceId,input.sourceHash]
    );
    snapshotId = existing.rows[0]?.id ? String(existing.rows[0].id) : "";
  }
  if (!snapshotId) throw new Error("Nova source snapshot could not be resolved");
  return snapshotId;
}

async function insertEvidenceBatch(snapshotId: string, sourceId: string, evidence: readonly NovaSourceEvidence[]) {
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
  `,[snapshotId,sourceId,JSON.stringify(rows)]);
}

async function refreshExistingOfferAvailability(evidence: readonly NovaSourceEvidence[]) {
  const variants = evidence.flatMap((item) => {
    const payload = item.normalizedPayload as Record<string, unknown>;
    const rawVariants = Array.isArray(payload.variants) ? payload.variants : [];
    return rawVariants.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const variant = value as Record<string, unknown>;
      const externalVariantId = scalarText(variant.externalVariantId);
      if (!externalVariantId) return [];
      return [{
        external_product_id: item.sourceProductKey,
        external_variant_id: externalVariantId,
        external_sku: scalarText(variant.sku),
        ean: scalarText(variant.barcode),
        mpn: scalarText(variant.mpn),
        cached_available: variant.available === true,
        cached_quantity: nullableInteger(variant.stockQuantity),
        availability_payload: {
          source: "nova_catalogue_sync",
          stockStatus: scalarText(variant.stockStatus),
          manageStock: variant.manageStock ?? null,
          inStock: variant.inStock ?? null,
          backordersAllowed: false
        }
      }];
    });
  });
  if (!variants.length) return;

  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.dropship_supplier_offers dso
    SET external_sku=COALESCE(x.external_sku,dso.external_sku),
        ean=COALESCE(x.ean,dso.ean),
        mpn=COALESCE(x.mpn,dso.mpn),
        cached_available=x.cached_available,
        cached_quantity=x.cached_quantity,
        availability_checked_at=now(),
        availability_expires_at=now() + interval '10 minutes',
        last_catalogue_sync_at=now(),
        active=CASE
          WHEN dso.availability_payload->>'withdrawnByDeletedFeed'='true'
            AND dso.availability_payload->>'activeBeforeWithdrawal'='true'
          THEN true
          ELSE dso.active
        END,
        availability_payload=(COALESCE(dso.availability_payload,'{}'::jsonb)
          - 'withdrawnByDeletedFeed' - 'activeBeforeWithdrawal' - 'deletedAt')
          || x.availability_payload
          || CASE
               WHEN dso.availability_payload->>'withdrawnByDeletedFeed'='true'
               THEN jsonb_build_object('reappearedAt',now())
               ELSE '{}'::jsonb
             END,
        updated_at=now()
    FROM jsonb_to_recordset($1::jsonb) AS x(
      external_product_id text,
      external_variant_id text,
      external_sku text,
      ean text,
      mpn text,
      cached_available boolean,
      cached_quantity integer,
      availability_payload jsonb
    ), public.dropship_suppliers ds
    WHERE ds.id=dso.supplier_id
      AND ds.code=$2
      AND dso.external_product_id=x.external_product_id
      AND dso.external_variant_id=x.external_variant_id
  `,[JSON.stringify(variants),SUPPLIER_CODE]);
}

async function saveState(sourceId: string, state: NovaSyncState) {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE public.catalog_sources
    SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{novaSync}',$2::jsonb,true),
        updated_at=now()
    WHERE id=$1
  `,[sourceId,JSON.stringify(state)]);
}

function parseState(value: unknown, now: Date): NovaSyncState {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const bootstrapStartedAt = validIso(input.bootstrapStartedAt) ?? now.toISOString();
  const bootstrapComplete = input.bootstrapComplete === true;
  const requestedPhase = input.phase === "deleted" ? "deleted" : input.phase === "delta" ? "delta" : "bootstrap";
  const phase: NovaSyncPhase = bootstrapComplete
    ? requestedPhase === "bootstrap" ? "delta" : requestedPhase
    : "bootstrap";
  return {
    version: 1,
    storeId: positiveInteger(input.storeId,DEFAULT_STORE_ID),
    phase,
    nextPage: positiveInteger(input.nextPage,1),
    perPage: Math.min(100,positiveInteger(input.perPage,DEFAULT_PER_PAGE)),
    bootstrapStartedAt,
    bootstrapCompletedAt: validIso(input.bootstrapCompletedAt) ?? undefined,
    bootstrapTotal: nullableInteger(input.bootstrapTotal),
    bootstrapComplete,
    deltaWatermark: validIso(input.deltaWatermark) ?? undefined,
    deltaWindowEnd: validIso(input.deltaWindowEnd) ?? undefined,
    deltaFilterPrecision: filterPrecision(input.deltaFilterPrecision),
    deletedWatermark: validIso(input.deletedWatermark) ?? undefined,
    deletedWindowEnd: validIso(input.deletedWindowEnd) ?? undefined,
    deletedFilterPrecision: filterPrecision(input.deletedFilterPrecision),
    lastSuccessfulAt: validIso(input.lastSuccessfulAt) ?? undefined,
    lastSuccessfulPage: nullableInteger(input.lastSuccessfulPage) ?? undefined,
    lastError: typeof input.lastError === "string" ? input.lastError.slice(0,500) : null,
    leaseUntil: validIso(input.leaseUntil)
  };
}

function pageComplete(itemCount: number, perPage: number, pageNumber: number, totalPages: number | null) {
  return itemCount === 0 || itemCount < perPage || (totalPages !== null && pageNumber >= totalPages);
}

function filterDate(iso: string, precision: FilterPrecision) {
  return precision === "date" ? iso.slice(0,10) : iso;
}

function filterPrecision(value: unknown): FilterPrecision | undefined {
  return value === "date" ? "date" : value === "timestamp" ? "timestamp" : undefined;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nullableInteger(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function scalarText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function maxPagesPerSlice() {
  const value = Number(process.env.NOVA_SYNC_MAX_PAGES_PER_SLICE ?? DEFAULT_MAX_PAGES_PER_SLICE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(50,value) : DEFAULT_MAX_PAGES_PER_SLICE;
}

function safeError(error: unknown) {
  if (error instanceof NovaV1ApiError) {
    return `${error.name}:${error.status}:${error.method}:${error.path}`.slice(0,500);
  }
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0,500);
}
