import { createHash } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { NovaV1ApiError, NovaV1Client, novaApiKeyFromEnvironment, type NovaProduct } from "../../../../integrations/dropship-suppliers/src/nova-v1.ts";
import { normalizeNovaProduct, type NovaSourceEvidence } from "../../../../integrations/dropship-suppliers/src/nova-normalize.ts";

const SOURCE_CODE = "nova-brandsgateway";
const SUPPLIER_CODE = "nova_brandsgateway";
const DEFAULT_STORE_ID = 2;
const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES_PER_SLICE = 40;
const LEASE_MS = 55_000;
const SLICE_MS = 47_000;
const DELTA_OVERLAP_MS = 5 * 60_000;

type NovaSyncState = {
  version: 1;
  storeId: number;
  phase: "bootstrap" | "delta";
  nextPage: number;
  perPage: number;
  bootstrapStartedAt: string;
  bootstrapCompletedAt?: string;
  bootstrapTotal?: number | null;
  bootstrapComplete: boolean;
  deltaWatermark?: string;
  deltaWindowEnd?: string;
  deltaFilterPrecision?: "timestamp" | "date";
  lastSuccessfulAt?: string;
  lastSuccessfulPage?: number;
  lastError?: string | null;
  leaseUntil?: string | null;
};

export type NovaSyncSliceResult = Readonly<{
  claimed: boolean;
  phase?: NovaSyncState["phase"];
  pages?: number;
  products?: number;
  nextPage?: number;
  bootstrapComplete?: boolean;
  total?: number | null;
  message?: string;
}>;

export async function runNovaCatalogueSyncSlice(): Promise<NovaSyncSliceResult> {
  const runtime = getProductionPostgresRuntime();
  const pool = runtime.sqlPool;
  const claimed = await pool.query<SqlRow>(`
    UPDATE public.catalog_sources cs
    SET metadata=jsonb_set(
          COALESCE(cs.metadata,'{}'::jsonb),
          '{novaSync}',
          COALESCE(cs.metadata->'novaSync','{}'::jsonb)
            || jsonb_build_object('leaseUntil', to_char(now() + interval '55 seconds','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'lastAttemptAt', now()),
          true
        ),
        updated_at=now()
    WHERE cs.code=$1
      AND cs.active=true
      AND EXISTS (
        SELECT 1 FROM public.dropship_suppliers ds
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
  `, [SOURCE_CODE, SUPPLIER_CODE]);

  const row = claimed.rows[0];
  if (!row) return { claimed: false, message: "disabled_or_busy" };
  const sourceId = String(row.id);
  const now = new Date();
  let state = parseState((row.metadata as Record<string, unknown> | undefined)?.novaSync, now);
  state.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  state.lastError = null;
  await saveState(sourceId, state);

  const client = new NovaV1Client({
    apiKey: novaApiKeyFromEnvironment(),
    baseUrl: process.env.NOVA_API_BASE_URL,
    requestsPerMinute: 60,
    requestTimeoutMs: 20_000
  });

  const deadline = Date.now() + SLICE_MS;
  let pages = 0;
  let products = 0;

  try {
    while (Date.now() < deadline && pages < maxPagesPerSlice()) {
      if (state.phase === "bootstrap") {
        const pageNumber = state.nextPage;
        const page = await client.listProducts(state.storeId, { page: pageNumber, per_page: state.perPage, lang: "en" });
        await persistProductPage({ sourceId, state, pageNumber, mode: "bootstrap", products: page.items, total: page.total, totalPages: page.totalPages });
        pages += 1;
        products += page.items.length;
        const complete = page.items.length === 0 || page.items.length < state.perPage || (page.totalPages !== null && pageNumber >= page.totalPages);
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
          state.deltaWatermark = new Date(new Date(state.bootstrapStartedAt).getTime() - DELTA_OVERLAP_MS).toISOString();
          state.deltaWindowEnd = undefined;
        }
        await saveState(sourceId, state);
        if (complete) break;
        continue;
      }

      const deltaResult = await runDeltaPage({ client, sourceId, state });
      state = deltaResult.state;
      pages += deltaResult.pageProcessed ? 1 : 0;
      products += deltaResult.products;
      await saveState(sourceId, state);
      if (deltaResult.windowComplete) break;
    }

    state.leaseUntil = null;
    await saveState(sourceId, state);
    return {
      claimed: true,
      phase: state.phase,
      pages,
      products,
      nextPage: state.nextPage,
      bootstrapComplete: state.bootstrapComplete,
      total: state.bootstrapTotal ?? null
    };
  } catch (error) {
    state.lastError = safeError(error);
    state.leaseUntil = null;
    await saveState(sourceId, state).catch(() => undefined);
    throw error;
  }
}

async function runDeltaPage(input: { client: NovaV1Client; sourceId: string; state: NovaSyncState }): Promise<{ state: NovaSyncState; products: number; pageProcessed: boolean; windowComplete: boolean }> {
  const state = input.state;
  const now = new Date();
  if (!state.deltaWindowEnd) {
    state.deltaWindowEnd = now.toISOString();
    state.nextPage = 1;
  }
  const startIso = state.deltaWatermark ?? new Date(now.getTime() - DELTA_OVERLAP_MS).toISOString();
  const endIso = state.deltaWindowEnd;
  const precision = state.deltaFilterPrecision ?? "timestamp";
  const updatedAtMin = precision === "date" ? startIso.slice(0, 10) : startIso;
  const updatedAtMax = precision === "date" ? endIso.slice(0, 10) : endIso;

  let page;
  try {
    page = await input.client.listProducts(state.storeId, {
      page: state.nextPage,
      per_page: state.perPage,
      lang: "en",
      updated_at_min: updatedAtMin,
      updated_at_max: updatedAtMax
    });
  } catch (error) {
    if (precision === "timestamp" && error instanceof NovaV1ApiError && error.status === 422) {
      state.deltaFilterPrecision = "date";
      return runDeltaPage(input);
    }
    throw error;
  }

  const pageNumber = state.nextPage;
  await persistProductPage({ sourceId: input.sourceId, state, pageNumber, mode: "delta", products: page.items, total: page.total, totalPages: page.totalPages, windowStart: updatedAtMin, windowEnd: updatedAtMax });
  const complete = page.items.length === 0 || page.items.length < state.perPage || (page.totalPages !== null && pageNumber >= page.totalPages);
  const completedAt = new Date().toISOString();
  state.lastSuccessfulAt = completedAt;
  state.lastSuccessfulPage = pageNumber;
  state.nextPage = pageNumber + 1;
  if (complete) {
    state.deltaWatermark = new Date(new Date(endIso).getTime() - DELTA_OVERLAP_MS).toISOString();
    state.deltaWindowEnd = undefined;
    state.nextPage = 1;
  }
  return { state, products: page.items.length, pageProcessed: true, windowComplete: complete };
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
}): Promise<void> {
  if (!input.products.length) return;
  const runtime = getProductionPostgresRuntime();
  const payloadText = JSON.stringify(input.products);
  const sourceHash = createHash("sha256").update(payloadText).digest("hex");
  const observedAt = new Date().toISOString();
  const snapshotResult = await runtime.sqlPool.query<SqlRow>(`
    INSERT INTO public.catalog_source_snapshots(
      source_id,source_filename,source_hash,source_version,observed_at,row_count,metadata
    ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT (source_id,source_hash) DO NOTHING
    RETURNING id
  `, [
    input.sourceId,
    `nova-products-${input.mode}-page-${input.pageNumber}.json`,
    sourceHash,
    `nova-shopwoo-v1:${input.mode}`,
    observedAt,
    input.products.length,
    JSON.stringify({
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
    })
  ]);

  let snapshotId = snapshotResult.rows[0]?.id ? String(snapshotResult.rows[0].id) : "";
  if (!snapshotId) {
    const existing = await runtime.sqlPool.query<SqlRow>(`SELECT id FROM public.catalog_source_snapshots WHERE source_id=$1 AND source_hash=$2`, [input.sourceId, sourceHash]);
    snapshotId = existing.rows[0]?.id ? String(existing.rows[0].id) : "";
  }
  if (!snapshotId) throw new Error("Nova source snapshot could not be resolved");

  const evidence = input.products.map((product) => normalizeNovaProduct(product, input.state.storeId));
  await insertEvidenceBatch(snapshotId, input.sourceId, evidence);
}

async function insertEvidenceBatch(snapshotId: string, sourceId: string, evidence: readonly NovaSourceEvidence[]): Promise<void> {
  if (!evidence.length) return;
  const runtime = getProductionPostgresRuntime();
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
  await runtime.sqlPool.query(`
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

async function saveState(sourceId: string, state: NovaSyncState): Promise<void> {
  const runtime = getProductionPostgresRuntime();
  await runtime.sqlPool.query(`
    UPDATE public.catalog_sources
    SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{novaSync}',$2::jsonb,true),updated_at=now()
    WHERE id=$1
  `, [sourceId, JSON.stringify(state)]);
}

function parseState(value: unknown, now: Date): NovaSyncState {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const bootstrapStartedAt = validIso(input.bootstrapStartedAt) ?? now.toISOString();
  const bootstrapComplete = input.bootstrapComplete === true;
  return {
    version: 1,
    storeId: positiveInteger(input.storeId, DEFAULT_STORE_ID),
    phase: bootstrapComplete ? "delta" : "bootstrap",
    nextPage: positiveInteger(input.nextPage, 1),
    perPage: Math.min(100, positiveInteger(input.perPage, DEFAULT_PER_PAGE)),
    bootstrapStartedAt,
    bootstrapCompletedAt: validIso(input.bootstrapCompletedAt) ?? undefined,
    bootstrapTotal: nullableInteger(input.bootstrapTotal),
    bootstrapComplete,
    deltaWatermark: validIso(input.deltaWatermark) ?? undefined,
    deltaWindowEnd: validIso(input.deltaWindowEnd) ?? undefined,
    deltaFilterPrecision: input.deltaFilterPrecision === "date" ? "date" : input.deltaFilterPrecision === "timestamp" ? "timestamp" : undefined,
    lastSuccessfulAt: validIso(input.lastSuccessfulAt) ?? undefined,
    lastSuccessfulPage: nullableInteger(input.lastSuccessfulPage) ?? undefined,
    lastError: typeof input.lastError === "string" ? input.lastError.slice(0, 500) : null,
    leaseUntil: validIso(input.leaseUntil)
  };
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nullableInteger(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function maxPagesPerSlice(): number {
  const value = Number(process.env.NOVA_SYNC_MAX_PAGES_PER_SLICE ?? DEFAULT_MAX_PAGES_PER_SLICE);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(50, value) : DEFAULT_MAX_PAGES_PER_SLICE;
}

function safeError(error: unknown): string {
  if (error instanceof NovaV1ApiError) return `${error.name}:${error.status}:${error.method}:${error.path}`.slice(0, 500);
  return (error instanceof Error ? `${error.name}:${error.message}` : String(error)).slice(0, 500);
}
