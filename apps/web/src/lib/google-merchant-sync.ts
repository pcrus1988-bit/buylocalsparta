import "server-only";

import { getGoogleMerchantAccessToken } from "./google-merchant-auth";
import {
  buildGoogleMerchantProductInput,
  googleMerchantProductInputSegment,
  type GoogleMerchantCandidate,
  type GoogleMerchantProductInput
} from "./google-merchant-product";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getPublicCatalogSourcePrimaryImages } from "./public-catalog-source-gallery";
import { approvedCatalogImages } from "./public-media-service";
import { publicOrigin } from "./public-origin";

const MERCHANT_API_BASE = "https://merchantapi.googleapis.com/products/v1";
const DEFAULT_ACCOUNT_ID = "5849642952";
const DEFAULT_DATA_SOURCE_ID = "10734504819";
// One deterministic full refresh per day leaves Merchant write quota headroom for
// removals while still keeping products far inside Google's 30-day expiry window.
const DEFAULT_SHARD_COUNT = 1440;
const MAX_SHARD_COUNT = 1440;
const IMAGE_BATCH_SIZE = 40;
const WRITE_CONCURRENCY = 12;
const CLEANUP_PAGE_SIZE = 1000;
const CLEANUP_SETTINGS_KEY = "merchant.google.cleanup.v1";
const ADVISORY_LOCK_KEY = "kontamou:google-merchant-sync:v1";

type CandidateRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  description: string | null;
  gtin: string | null;
  mpn: string | null;
  brand_name: string | null;
  color: string | null;
  condition: string | null;
  min_price_minor: number | string;
}>;

type ProcessedProduct = Readonly<{
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  dataSource?: string;
}>;

type ProductListResponse = Readonly<{
  products?: readonly ProcessedProduct[];
  nextPageToken?: string;
}>;

type CleanupState = Readonly<{ nextPageToken?: string | null }>;

type MerchantConfig = Readonly<{
  accountId: string;
  dataSourceId: string;
  dataSource: string;
  shardCount: number;
}>;

export type GoogleMerchantSyncResult = Readonly<{
  status: "synced" | "partial" | "skipped";
  shard: number;
  shardCount: number;
  candidates: number;
  submitted: number;
  skippedNoImage: number;
  failed: number;
  cleanupExamined: number;
  cleanupDeleted: number;
  cleanupFailed: number;
  errors: readonly string[];
}>;

function merchantConfig(env: NodeJS.ProcessEnv = process.env): MerchantConfig {
  const accountId = env.GOOGLE_MERCHANT_ACCOUNT_ID?.trim() || DEFAULT_ACCOUNT_ID;
  const dataSourceId = env.GOOGLE_MERCHANT_DATA_SOURCE_ID?.trim() || DEFAULT_DATA_SOURCE_ID;
  if (!/^\d+$/.test(accountId) || !/^\d+$/.test(dataSourceId)) throw new Error("Google Merchant account/data-source IDs must be numeric.");
  const requestedShards = Number.parseInt(env.GOOGLE_MERCHANT_SYNC_SHARDS?.trim() || String(DEFAULT_SHARD_COUNT), 10);
  const shardCount = Number.isSafeInteger(requestedShards) && requestedShards >= 60 && requestedShards <= MAX_SHARD_COUNT
    ? requestedShards
    : DEFAULT_SHARD_COUNT;
  return {
    accountId,
    dataSourceId,
    dataSource: `accounts/${accountId}/dataSources/${dataSourceId}`,
    shardCount
  };
}

function currentShard(shardCount: number, now = Date.now()): number {
  return Math.floor(now / 60_000) % shardCount;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? "Unknown Merchant sync error"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function retryDelay(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  const retrySeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retrySeconds) && retrySeconds >= 0) return Math.min(5_000, retrySeconds * 1000);
  return [250, 750, 1_500][Math.min(attempt, 2)];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function merchantFetch(accessToken: string, url: URL | string, init: RequestInit, label: string): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers ?? {})
        },
        cache: "no-store"
      });
      lastResponse = response;
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        const text = await response.text();
        throw new Error(`${label} failed (${response.status}): ${text.replace(/\s+/g, " ").trim().slice(0, 700) || response.statusText}`);
      }
      if (attempt < 2) await sleep(retryDelay(attempt, response));
    } catch (error) {
      if (attempt >= 2 || (error instanceof Error && /failed \([34]\d\d\)/.test(error.message))) throw error;
      await sleep(retryDelay(attempt));
    }
  }
  const text = lastResponse ? await lastResponse.text() : "";
  throw new Error(`${label} failed (${lastResponse?.status ?? "network"}): ${text.replace(/\s+/g, " ").trim().slice(0, 700)}`);
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function loadCandidates(shard: number, shardCount: number): Promise<readonly CandidateRow[]> {
  const pool = getProductionPostgresRuntime().nativePool;
  const result = await pool.query<CandidateRow>(`
    SELECT
      rm.canonical_public_id,
      rm.slug,
      rm.title,
      rm.description,
      rm.gtin,
      rm.mpn,
      rm.brand_name,
      rm.color,
      cv.condition,
      rm.min_price_minor
    FROM public.storefront_catalog_read_model rm
    JOIN canonical_variants cv ON cv.id=rm.canonical_variant_id
    WHERE (
      (rm.local_sellable=true AND rm.local_available_until>now())
      OR (rm.dropship_sellable=true AND rm.dropship_available_until>now())
    )
      AND rm.min_price_minor>0
      AND mod(abs(hashtext(rm.canonical_public_id)::bigint),$1::bigint)=$2::bigint
    ORDER BY rm.canonical_public_id
  `, [shardCount, shard]);
  return result.rows;
}

function toCandidate(row: CandidateRow): GoogleMerchantCandidate {
  return {
    canonicalPublicId: row.canonical_public_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    gtin: row.gtin,
    mpn: row.mpn,
    brand: row.brand_name,
    color: row.color,
    condition: row.condition,
    priceMinor: row.min_price_minor
  };
}

async function productImages(rows: readonly CandidateRow[]): Promise<ReadonlyMap<string, string>> {
  const images = new Map<string, string>();
  const origin = publicOrigin();

  // Prefer KONTA MOY governed media. This covers local merchants and any supplier
  // asset that has completed rights, malware and moderation review.
  try {
    const approved = await approvedCatalogImages(rows.map((row) => ({ canonicalVariantId: row.canonical_public_id })));
    for (const image of approved) {
      images.set(image.canonicalVariantId, new URL(`/api/media/${encodeURIComponent(image.mediaId)}`, origin).toString());
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "merchant.approved_media_projection_failed", message: errorText(error) }));
  }

  // Dropship products can use the already-governed, same-source HTTPS image
  // projection used by the storefront. Resolve only products still missing media.
  const unresolved = rows.filter((row) => !images.has(row.canonical_public_id));
  for (let offset = 0; offset < unresolved.length; offset += IMAGE_BATCH_SIZE) {
    const batch = unresolved.slice(offset, offset + IMAGE_BATCH_SIZE);
    const resolved = await getPublicCatalogSourcePrimaryImages(batch.map((row) => ({ canonicalVariantId: row.canonical_public_id })));
    for (const [id, image] of resolved) images.set(id, image.src);
  }
  return images;
}

async function insertProduct(accessToken: string, config: MerchantConfig, input: GoogleMerchantProductInput): Promise<void> {
  const url = new URL(`${MERCHANT_API_BASE}/accounts/${config.accountId}/productInputs:insert`);
  url.searchParams.set("dataSource", config.dataSource);
  await merchantFetch(accessToken, url, { method: "POST", body: JSON.stringify(input) }, `Merchant insert ${input.offerId}`);
}

async function readCleanupState(): Promise<CleanupState> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ value: unknown }>(`
    SELECT s.value
    FROM system_settings s
    JOIN markets m ON m.id=s.market_id
    WHERE m.code='sparta' AND s.key=$1
    LIMIT 1
  `, [CLEANUP_SETTINGS_KEY]);
  const value = result.rows[0]?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const token = (value as Record<string, unknown>).nextPageToken;
  return { nextPageToken: typeof token === "string" && token.trim() ? token : null };
}

async function writeCleanupState(nextPageToken: string | undefined): Promise<void> {
  const value = JSON.stringify({ nextPageToken: nextPageToken?.trim() || null, updatedAt: new Date().toISOString() });
  await getProductionPostgresRuntime().nativePool.query(`
    INSERT INTO system_settings(market_id,key,value,version,updated_by,updated_at)
    SELECT m.id,$1,$2::jsonb,1,NULL,now()
    FROM markets m
    WHERE m.code='sparta'
    ON CONFLICT(market_id,key) DO UPDATE SET
      value=excluded.value,
      version=system_settings.version+1,
      updated_by=NULL,
      updated_at=now()
  `, [CLEANUP_SETTINGS_KEY, value]);
}

async function listManagedProducts(accessToken: string, config: MerchantConfig, pageToken?: string | null): Promise<ProductListResponse> {
  const url = new URL(`${MERCHANT_API_BASE}/accounts/${config.accountId}/products`);
  url.searchParams.set("pageSize", String(CLEANUP_PAGE_SIZE));
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const response = await merchantFetch(accessToken, url, { method: "GET" }, "Merchant products.list");
  return await response.json() as ProductListResponse;
}

async function liveOfferIds(offerIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (!offerIds.length) return new Set();
  const result = await getProductionPostgresRuntime().nativePool.query<{ canonical_public_id: string }>(`
    SELECT rm.canonical_public_id
    FROM public.storefront_catalog_read_model rm
    WHERE rm.canonical_public_id=ANY($1::text[])
      AND (
        (rm.local_sellable=true AND rm.local_available_until>now())
        OR (rm.dropship_sellable=true AND rm.dropship_available_until>now())
      )
  `, [offerIds]);
  return new Set(result.rows.map((row) => row.canonical_public_id));
}

async function deleteProduct(accessToken: string, config: MerchantConfig, offerId: string): Promise<void> {
  const productId = googleMerchantProductInputSegment("el", "GR", offerId);
  const url = new URL(`${MERCHANT_API_BASE}/accounts/${config.accountId}/productInputs/${productId}`);
  url.searchParams.set("dataSource", config.dataSource);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (response.ok || response.status === 404) return;
  const text = await response.text();
  throw new Error(`Merchant delete ${offerId} failed (${response.status}): ${text.replace(/\s+/g, " ").trim().slice(0, 500)}`);
}

async function cleanupStaleProducts(accessToken: string, config: MerchantConfig): Promise<Readonly<{
  examined: number;
  deleted: number;
  failed: number;
  errors: readonly string[];
}>> {
  const state = await readCleanupState();
  const page = await listManagedProducts(accessToken, config, state.nextPageToken);
  const managed = (page.products ?? []).filter((product) =>
    product.dataSource === config.dataSource
    && product.contentLanguage === "el"
    && product.feedLabel === "GR"
    && typeof product.offerId === "string"
    && product.offerId.trim().length > 0
  );
  const offerIds = [...new Set(managed.map((product) => product.offerId!.trim()))];
  const live = await liveOfferIds(offerIds);
  const stale = offerIds.filter((offerId) => !live.has(offerId));
  const errors: string[] = [];
  let deleted = 0;
  let failed = 0;
  await mapConcurrent(stale, WRITE_CONCURRENCY, async (offerId) => {
    try {
      await deleteProduct(accessToken, config, offerId);
      deleted += 1;
    } catch (error) {
      failed += 1;
      if (errors.length < 10) errors.push(errorText(error));
    }
  });
  if (failed === 0) await writeCleanupState(page.nextPageToken);
  return { examined: offerIds.length, deleted, failed, errors };
}

export async function syncGoogleMerchantCatalogue(now = Date.now()): Promise<GoogleMerchantSyncResult> {
  const config = merchantConfig();
  const shard = currentShard(config.shardCount, now);
  const empty = {
    shard,
    shardCount: config.shardCount,
    candidates: 0,
    submitted: 0,
    skippedNoImage: 0,
    failed: 0,
    cleanupExamined: 0,
    cleanupDeleted: 0,
    cleanupFailed: 0,
    errors: [] as string[]
  };
  if (!productionDatabaseConfigured()) return { status: "skipped", ...empty };

  const pool = getProductionPostgresRuntime().nativePool;
  const lockClient = await pool.connect();
  let lockHeld = false;
  try {
    const lock = await lockClient.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [ADVISORY_LOCK_KEY]);
    lockHeld = Boolean(lock.rows[0]?.locked);
    if (!lockHeld) return { status: "skipped", ...empty };

    const accessToken = await getGoogleMerchantAccessToken();
    const rows = await loadCandidates(shard, config.shardCount);
    const imageById = await productImages(rows);
    const errors: string[] = [];
    let submitted = 0;
    let failed = 0;
    let skippedNoImage = 0;

    const uploadable = rows.flatMap((row) => {
      const image = imageById.get(row.canonical_public_id);
      if (!image) {
        skippedNoImage += 1;
        return [];
      }
      try {
        return [buildGoogleMerchantProductInput(toCandidate(row), image, publicOrigin())];
      } catch (error) {
        failed += 1;
        if (errors.length < 10) errors.push(errorText(error));
        return [];
      }
    });

    await mapConcurrent(uploadable, WRITE_CONCURRENCY, async (input) => {
      try {
        await insertProduct(accessToken, config, input);
        submitted += 1;
      } catch (error) {
        failed += 1;
        if (errors.length < 10) errors.push(errorText(error));
      }
    });

    let cleanup = { examined: 0, deleted: 0, failed: 0, errors: [] as readonly string[] };
    try {
      cleanup = await cleanupStaleProducts(accessToken, config);
      for (const error of cleanup.errors) if (errors.length < 10) errors.push(error);
    } catch (error) {
      cleanup = { examined: 0, deleted: 0, failed: 1, errors: [errorText(error)] };
      if (errors.length < 10) errors.push(errorText(error));
    }

    return {
      status: failed > 0 || cleanup.failed > 0 ? "partial" : "synced",
      shard,
      shardCount: config.shardCount,
      candidates: rows.length,
      submitted,
      skippedNoImage,
      failed,
      cleanupExamined: cleanup.examined,
      cleanupDeleted: cleanup.deleted,
      cleanupFailed: cleanup.failed,
      errors
    };
  } finally {
    if (lockHeld) {
      try { await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [ADVISORY_LOCK_KEY]); } catch { /* connection release closes the lock eventually */ }
    }
    lockClient.release();
  }
}
