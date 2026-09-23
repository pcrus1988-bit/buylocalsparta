import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getGoogleMerchantAccessToken } from "./google-merchant-auth";
import { getMerchantProductInsertQuota, merchantWritePlan, runMerchantWritesQuotaAware } from "./google-merchant-quota";
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
const DEFAULT_SHARD_COUNT = 144;
const MAX_SHARD_COUNT = 144;
const SYNC_SLOT_MS = 10 * 60_000;
const IMAGE_BATCH_SIZE = 40;
const WRITE_CONCURRENCY = 40;
const RUN_BATCH_TARGET = 2000;
const CLEANUP_PAGE_SIZE = 1000;
const CLEANUP_SETTINGS_KEY = "merchant.google.cleanup.v1";
const GOOGLE_MERCHANT_SYNC_JOB = "google-merchant-catalogue-sync";
const GOOGLE_MERCHANT_SYNC_LEASE_MS = 2 * 60_000;
const REFRESH_AFTER_MS = 26 * 24 * 60 * 60 * 1000;

type CandidateRow = Readonly<{
  canonical_variant_id: string;
  canonical_public_id: string;
  slug: string;
  title: string;
  description: string;
  gtin: string | null;
  mpn: string | null;
  brand_name: string | null;
  color: string | null;
  condition: string | null;
  min_price_minor: number | string;
}>;

type ProcessedProduct = Readonly<{
  name?: string;
  offerId?: string;
  contentLanguage?: string;
  feedLabel?: string;
  dataSource?: string;
}>;

type ProductListResponse = Readonly<{ products?: readonly ProcessedProduct[]; nextPageToken?: string }>;
type CleanupState = Readonly<{ nextPageToken?: string | null }>;
type MerchantConfig = Readonly<{ accountId: string; dataSourceId: string; dataSource: string; shardCount: number }>;
type PersistedSync = Readonly<{ payload_hash: string | null; last_success_at: Date | string | null }>;

export type GoogleMerchantSyncResult = Readonly<{
  status: "synced" | "partial" | "skipped";
  shard: number;
  shardCount: number;
  candidates: number;
  submitted: number;
  unchanged: number;
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
  const shardCount = Number.isSafeInteger(requestedShards) && requestedShards >= 60 && requestedShards <= MAX_SHARD_COUNT ? requestedShards : DEFAULT_SHARD_COUNT;
  return { accountId, dataSourceId, dataSource: `accounts/${accountId}/dataSources/${dataSourceId}`, shardCount };
}

function currentShard(shardCount: number, now = Date.now()): number {
  return Math.floor(now / SYNC_SLOT_MS) % shardCount;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? "Unknown Merchant sync error")).replace(/\s+/g, " ").trim().slice(0, 900);
}

function retryDelay(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  const retrySeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retrySeconds) && retrySeconds >= 0) return Math.min(5_000, retrySeconds * 1000);
  return [250, 750, 1_500][Math.min(attempt, 2)];
}

async function sleep(ms: number): Promise<void> { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function merchantFetch(accessToken: string, url: URL | string, init: RequestInit, label: string): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { authorization: `Bearer ${accessToken}`, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
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
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function loadCandidates(
  accountId: string,
  shard: number,
  shardCount: number,
  batchTarget = RUN_BATCH_TARGET
): Promise<readonly CandidateRow[]> {
  const result = await getProductionPostgresRuntime().nativePool.query<CandidateRow>(`
    WITH live_offer AS (
      SELECT vo.canonical_variant_id, min(vo.customer_price_minor) AS live_price_minor
      FROM public.vendor_offers vo
      JOIN public.vendor_businesses v ON v.id=vo.vendor_id
      JOIN public.vendor_locations l ON l.id=vo.location_id
      LEFT JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      LEFT JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND (
          (
            dso.id IS NOT NULL
            AND dso.active=true
            AND ds.active=true
            AND ds.api_authoritative_availability=true
            AND dso.cached_available=true
            AND dso.cached_quantity>=1
            AND dso.availability_expires_at>now()
            AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          )
          OR (
            dso.id IS NULL
            AND GREATEST(
              0,
              COALESCE(ib.on_hand,0)
                - COALESCE(ib.active_reservations,0)
                - COALESCE(ib.safety_stock,0)
                - COALESCE(ib.blocked,0)
            )>0
          )
        )
      GROUP BY vo.canonical_variant_id
    )
    SELECT
      cv.id AS canonical_variant_id,
      cv.public_id AS canonical_public_id,
      cv.slug,
      pt.title,
      pt.description,
      cv.gtin,
      cv.mpn,
      COALESCE(NULLIF(btrim(rm.brand_name),''),b.name) AS brand_name,
      NULLIF(btrim(rm.color),'') AS color,
      cv.condition,
      lo.live_price_minor AS min_price_minor
    FROM public.canonical_variants cv
    JOIN live_offer lo ON lo.canonical_variant_id=cv.id
    JOIN public.product_translations pt ON pt.canonical_variant_id=cv.id AND pt.locale='el'
    LEFT JOIN public.brands b ON b.id=cv.brand_id
    LEFT JOIN public.storefront_catalog_read_model rm ON rm.canonical_variant_id=cv.id
    LEFT JOIN public.merchant_product_sync mps
      ON mps.merchant_account_id=$1
     AND mps.content_language='el'
     AND mps.feed_label='GR'
     AND mps.offer_id=cv.public_id
    WHERE cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND nullif(btrim(pt.title),'') IS NOT NULL
      AND nullif(btrim(coalesce(pt.description,'')),'') IS NOT NULL
      AND (
        mps.id IS NULL
        OR mps.sync_status<>'synced'
        OR mod(abs(hashtext(cv.public_id)::bigint),$2::bigint)=$3::bigint
      )
    ORDER BY
      CASE WHEN mps.id IS NULL OR mps.sync_status<>'synced' THEN 0 ELSE 1 END,
      mps.last_success_at NULLS FIRST,
      cv.public_id
    LIMIT $4
  `, [accountId, shardCount, shard, batchTarget]);
  return result.rows;
}function toCandidate(row: CandidateRow): GoogleMerchantCandidate {
  return { canonicalPublicId: row.canonical_public_id, slug: row.slug, title: row.title, description: row.description, gtin: row.gtin, mpn: row.mpn, brand: row.brand_name, color: row.color, condition: row.condition, priceMinor: row.min_price_minor };
}

async function productImages(rows: readonly CandidateRow[]): Promise<ReadonlyMap<string, string>> {
  const images = new Map<string, string>();
  const origin = publicOrigin();
  try {
    const approved = await approvedCatalogImages(rows.map((row) => ({ canonicalVariantId: row.canonical_public_id })));
    for (const image of approved) images.set(image.canonicalVariantId, new URL(`/api/media/${encodeURIComponent(image.mediaId)}`, origin).toString());
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "merchant.approved_media_projection_failed", message: errorText(error) }));
  }
  const unresolved = rows.filter((row) => !images.has(row.canonical_public_id));
  for (let offset = 0; offset < unresolved.length; offset += IMAGE_BATCH_SIZE) {
    const batch = unresolved.slice(offset, offset + IMAGE_BATCH_SIZE);
    const resolved = await getPublicCatalogSourcePrimaryImages(batch.map((row) => ({ canonicalVariantId: row.canonical_public_id })));
    for (const [id, image] of resolved) images.set(id, image.src);
  }
  return images;
}

function payloadHash(input: GoogleMerchantProductInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function loadPersistedSync(accountId: string, offerIds: readonly string[]): Promise<Map<string, PersistedSync>> {
  if (!offerIds.length) return new Map();
  const result = await getProductionPostgresRuntime().nativePool.query<{ offer_id: string; payload_hash: string | null; last_success_at: Date | string | null }>(`
    SELECT offer_id,payload_hash,last_success_at FROM public.merchant_product_sync
    WHERE merchant_account_id=$1 AND content_language='el' AND feed_label='GR' AND offer_id=ANY($2::text[])
  `, [accountId, offerIds]);
  return new Map(result.rows.map((row) => [row.offer_id, row]));
}

function requiresRefresh(state: PersistedSync | undefined, hash: string, now: number): boolean {
  if (!state || state.payload_hash !== hash || !state.last_success_at) return true;
  return now - new Date(state.last_success_at).getTime() >= REFRESH_AFTER_MS;
}

async function insertProduct(accessToken: string, config: MerchantConfig, input: GoogleMerchantProductInput): Promise<{ name?: string }> {
  const url = new URL(`${MERCHANT_API_BASE}/accounts/${config.accountId}/productInputs:insert`);
  url.searchParams.set("dataSource", config.dataSource);
  const response = await merchantFetch(accessToken, url, { method: "POST", body: JSON.stringify(input) }, `Merchant insert ${input.offerId}`);
  return await response.json() as { name?: string };
}

async function persistSuccess(config: MerchantConfig, row: CandidateRow, input: GoogleMerchantProductInput, hash: string, response: { name?: string }): Promise<void> {
  const inputName = response.name || `accounts/${config.accountId}/productInputs/${googleMerchantProductInputSegment("el", "GR", input.offerId)}`;
  await getProductionPostgresRuntime().nativePool.query(`
    INSERT INTO public.merchant_product_sync(canonical_variant_id,offer_id,merchant_account_id,data_source_name,content_language,feed_label,product_input_name,payload_hash,last_submitted_payload,sync_status,last_sync_at,last_success_at,retry_count,last_error_code,last_error_message,first_synced_at,updated_at)
    VALUES($1,$2,$3,$4,'el','GR',$5,$6,$7::jsonb,'synced',now(),now(),0,NULL,NULL,now(),now())
    ON CONFLICT(merchant_account_id,content_language,feed_label,offer_id) DO UPDATE SET
      canonical_variant_id=excluded.canonical_variant_id,data_source_name=excluded.data_source_name,product_input_name=excluded.product_input_name,payload_hash=excluded.payload_hash,last_submitted_payload=excluded.last_submitted_payload,sync_status='synced',last_sync_at=now(),last_success_at=now(),retry_count=0,next_retry_at=NULL,last_error_code=NULL,last_error_message=NULL,first_synced_at=coalesce(merchant_product_sync.first_synced_at,now()),updated_at=now()
  `, [row.canonical_variant_id, input.offerId, config.accountId, config.dataSource, inputName, hash, JSON.stringify(input)]);
}

async function persistFailure(config: MerchantConfig, row: CandidateRow, input: GoogleMerchantProductInput, hash: string, message: string): Promise<void> {
  await getProductionPostgresRuntime().nativePool.query(`
    INSERT INTO public.merchant_product_sync(canonical_variant_id,offer_id,merchant_account_id,data_source_name,content_language,feed_label,payload_hash,last_submitted_payload,sync_status,last_sync_at,retry_count,next_retry_at,last_error_message,updated_at)
    VALUES($1,$2,$3,$4,'el','GR',$5,$6::jsonb,'failed',now(),1,now()+interval '15 minutes',$7,now())
    ON CONFLICT(merchant_account_id,content_language,feed_label,offer_id) DO UPDATE SET
      canonical_variant_id=excluded.canonical_variant_id,payload_hash=excluded.payload_hash,last_submitted_payload=excluded.last_submitted_payload,sync_status='failed',last_sync_at=now(),retry_count=merchant_product_sync.retry_count+1,next_retry_at=now()+least(interval '12 hours', interval '15 minutes' * power(2,least(merchant_product_sync.retry_count,5))),last_error_message=excluded.last_error_message,updated_at=now()
  `, [row.canonical_variant_id, input.offerId, config.accountId, config.dataSource, hash, JSON.stringify(input), message]);
}

async function readCleanupState(): Promise<CleanupState> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ value: unknown }>(`SELECT s.value FROM system_settings s JOIN markets m ON m.id=s.market_id WHERE m.code='sparta' AND s.key=$1 LIMIT 1`, [CLEANUP_SETTINGS_KEY]);
  const value = result.rows[0]?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const token = (value as Record<string, unknown>).nextPageToken;
  return { nextPageToken: typeof token === "string" && token.trim() ? token : null };
}

async function writeCleanupState(nextPageToken: string | undefined): Promise<void> {
  const value = JSON.stringify({ nextPageToken: nextPageToken?.trim() || null, updatedAt: new Date().toISOString() });
  await getProductionPostgresRuntime().nativePool.query(`
    INSERT INTO system_settings(market_id,key,value,version,updated_by,updated_at)
    SELECT m.id,$1,$2::jsonb,1,NULL,now() FROM markets m WHERE m.code='sparta'
    ON CONFLICT(market_id,key) DO UPDATE SET value=excluded.value,version=system_settings.version+1,updated_by=NULL,updated_at=now()
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
    SELECT DISTINCT cv.public_id AS canonical_public_id
    FROM public.canonical_variants cv
    JOIN public.product_translations pt ON pt.canonical_variant_id=cv.id AND pt.locale='el'
    JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
    JOIN public.vendor_businesses v ON v.id=vo.vendor_id
    JOIN public.vendor_locations l ON l.id=vo.location_id
    LEFT JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    LEFT JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
    LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id
    WHERE cv.public_id=ANY($1::text[])
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND v.status='active'
      AND l.active=true
      AND nullif(btrim(pt.title),'') IS NOT NULL
      AND nullif(btrim(coalesce(pt.description,'')),'') IS NOT NULL
      AND (
        (
          dso.id IS NOT NULL
          AND dso.active=true
          AND ds.active=true
          AND ds.api_authoritative_availability=true
          AND dso.cached_available=true
          AND dso.cached_quantity>=1
          AND dso.availability_expires_at>now()
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        )
        OR (
          dso.id IS NULL
          AND GREATEST(
            0,
            COALESCE(ib.on_hand,0)
              - COALESCE(ib.active_reservations,0)
              - COALESCE(ib.safety_stock,0)
              - COALESCE(ib.blocked,0)
          )>0
        )
      )
  `, [offerIds]);
  return new Set(result.rows.map((row) => row.canonical_public_id));
}
async function deleteProduct(accessToken: string, config: MerchantConfig, offerId: string): Promise<void> {
  const productId = googleMerchantProductInputSegment("el", "GR", offerId);
  const url = new URL(`${MERCHANT_API_BASE}/accounts/${config.accountId}/productInputs/${productId}`);
  url.searchParams.set("dataSource", config.dataSource);
  const response = await fetch(url, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Merchant delete ${offerId} failed (${response.status}): ${text.replace(/\s+/g, " ").trim().slice(0, 500)}`);
  }
  await getProductionPostgresRuntime().nativePool.query(`UPDATE public.merchant_product_sync SET sync_status='deleted',updated_at=now() WHERE merchant_account_id=$1 AND content_language='el' AND feed_label='GR' AND offer_id=$2`, [config.accountId, offerId]);
}

async function cleanupStaleProducts(accessToken: string, config: MerchantConfig): Promise<{ examined: number; deleted: number; failed: number; errors: readonly string[] }> {
  const state = await readCleanupState();
  const page = await listManagedProducts(accessToken, config, state.nextPageToken);
  const managed = (page.products ?? []).filter((product) => product.dataSource === config.dataSource && product.contentLanguage === "el" && product.feedLabel === "GR" && typeof product.offerId === "string" && product.offerId.trim());
  const offerIds = [...new Set(managed.map((product) => product.offerId!.trim()))];
  const live = await liveOfferIds(offerIds);
  const stale = offerIds.filter((offerId) => !live.has(offerId));
  const errors: string[] = [];
  let deleted = 0;
  let failed = 0;
  await mapConcurrent(stale, WRITE_CONCURRENCY, async (offerId) => {
    try { await deleteProduct(accessToken, config, offerId); deleted += 1; }
    catch (error) { failed += 1; if (errors.length < 10) errors.push(errorText(error)); }
  });
  if (failed === 0) await writeCleanupState(page.nextPageToken);
  return { examined: offerIds.length, deleted, failed, errors };
}

export async function syncGoogleMerchantCatalogue(now = Date.now()): Promise<GoogleMerchantSyncResult> {
  const config = merchantConfig();
  const shard = currentShard(config.shardCount, now);
  const empty = { shard, shardCount: config.shardCount, candidates: 0, submitted: 0, unchanged: 0, skippedNoImage: 0, failed: 0, cleanupExamined: 0, cleanupDeleted: 0, cleanupFailed: 0, errors: [] as string[] };
  if (!productionDatabaseConfigured()) return { status: "skipped", ...empty };

  const pool = getProductionPostgresRuntime().nativePool;
  const leaseOwner = `merchant:${randomUUID()}`;
  const lease = await pool.query<{ lock_owner: string }>(`
    INSERT INTO public.scheduled_jobs(
      name,next_run_at,lock_owner,locked_until,last_started_at,last_succeeded_at,
      consecutive_failures,last_error,updated_at
    )
    VALUES($1,$2,$3,$4,$2,NULL,0,NULL,$2)
    ON CONFLICT(name) DO UPDATE SET
      lock_owner=EXCLUDED.lock_owner,
      locked_until=EXCLUDED.locked_until,
      last_started_at=EXCLUDED.last_started_at,
      updated_at=EXCLUDED.updated_at
    WHERE scheduled_jobs.locked_until IS NULL
       OR scheduled_jobs.locked_until <= EXCLUDED.last_started_at
    RETURNING lock_owner
  `, [
    GOOGLE_MERCHANT_SYNC_JOB,
    new Date(now),
    leaseOwner,
    new Date(now + GOOGLE_MERCHANT_SYNC_LEASE_MS)
  ]);
  if (lease.rows[0]?.lock_owner !== leaseOwner) return { status: "skipped", ...empty };

  let completed = false;
  let failureMessage: string | undefined;
  const run = await pool.query<{ id: string }>(`INSERT INTO public.merchant_sync_runs(run_type,status,shard,shard_count) VALUES('catalogue_sync','running',$1,$2) RETURNING id`, [shard, config.shardCount]);
  const runId = run.rows[0]?.id;
  try {
    const accessToken = await getGoogleMerchantAccessToken();
    const rows = await loadCandidates(config.accountId, shard, config.shardCount, RUN_BATCH_TARGET);
    const imageById = await productImages(rows);
    const errors: string[] = [];
    let submitted = 0;
    let unchanged = 0;
    let failed = 0;
    let skippedNoImage = 0;

    const prepared = rows.flatMap((row) => {
      const image = imageById.get(row.canonical_public_id);
      if (!image) { skippedNoImage += 1; return []; }
      try {
        const input = buildGoogleMerchantProductInput(toCandidate(row), image, publicOrigin());
        return [{ row, input, hash: payloadHash(input) }];
      } catch (error) { failed += 1; if (errors.length < 10) errors.push(errorText(error)); return []; }
    });
    const state = await loadPersistedSync(config.accountId, prepared.map((item) => item.input.offerId));
    const changed = prepared.filter((item) => {
      const needed = requiresRefresh(state.get(item.input.offerId), item.hash, now);
      if (!needed) unchanged += 1;
      return needed;
    });

    const quota = await getMerchantProductInsertQuota(accessToken, config.accountId);
    const plan = merchantWritePlan(quota, Math.min(RUN_BATCH_TARGET, changed.length));
    const writable = changed.slice(0, plan.allowed);
    const quotaDeferred = Math.max(0, changed.length - writable.length);
    if (quotaDeferred > 0 && errors.length < 10) {
      errors.push(`Merchant quota deferred ${quotaDeferred} writes; dailyRemaining=${quota.dailyRemaining}, minuteLimit=${quota.minuteLimit}.`);
    }

    await runMerchantWritesQuotaAware(writable, quota, WRITE_CONCURRENCY, async ({ row, input, hash }) => {
      try {
        const response = await insertProduct(accessToken, config, input);
        await persistSuccess(config, row, input, hash, response);
        submitted += 1;
      } catch (error) {
        failed += 1;
        const message = errorText(error);
        await persistFailure(config, row, input, hash, message).catch(() => undefined);
        if (errors.length < 10) errors.push(message);
      }
    });

    let cleanup = { examined: 0, deleted: 0, failed: 0, errors: [] as readonly string[] };
    try { cleanup = await cleanupStaleProducts(accessToken, config); for (const e of cleanup.errors) if (errors.length < 10) errors.push(e); }
    catch (error) { cleanup = { examined: 0, deleted: 0, failed: 1, errors: [errorText(error)] }; if (errors.length < 10) errors.push(errorText(error)); }

    const status = failed > 0 || cleanup.failed > 0 ? "partial" : "synced" as const;
    if (runId) await pool.query(`UPDATE public.merchant_sync_runs SET status=$2,queued_count=$3,attempted_count=$4,submitted_count=$5,unchanged_count=$6,deleted_count=$7,failed_count=$8,metadata=$9::jsonb,finished_at=now() WHERE id=$1`, [runId,status,rows.length,changed.length,submitted,unchanged,cleanup.deleted,failed+cleanup.failed,JSON.stringify({ skippedNoImage, cleanupExamined: cleanup.examined, errors })]);
    completed = true;
    return { status, shard, shardCount: config.shardCount, candidates: rows.length, submitted, unchanged, skippedNoImage, failed, cleanupExamined: cleanup.examined, cleanupDeleted: cleanup.deleted, cleanupFailed: cleanup.failed, errors };
  } catch (error) {
    failureMessage = errorText(error);
    if (runId) await pool.query(`UPDATE public.merchant_sync_runs SET status='failed',failed_count=failed_count+1,metadata=jsonb_build_object('error',$2),finished_at=now() WHERE id=$1`, [runId,failureMessage]).catch(() => undefined);
    throw error;
  } finally {
    const finishedAt = new Date();
    await pool.query(`
      UPDATE public.scheduled_jobs
      SET lock_owner=NULL,
          locked_until=NULL,
          last_succeeded_at=CASE WHEN $4::boolean THEN $2 ELSE last_succeeded_at END,
          consecutive_failures=CASE WHEN $4::boolean THEN 0 ELSE consecutive_failures+1 END,
          last_error=CASE WHEN $4::boolean THEN NULL ELSE $3 END,
          updated_at=$2
      WHERE name=$1 AND lock_owner=$5
    `, [
      GOOGLE_MERCHANT_SYNC_JOB,
      finishedAt,
      failureMessage?.slice(0, 1000) ?? null,
      completed,
      leaseOwner
    ]).catch(() => undefined);
  }
}
