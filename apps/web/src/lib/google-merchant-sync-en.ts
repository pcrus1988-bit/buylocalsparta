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

const ACCOUNT_ID = "5849642952";
const FEED_LABEL = "GR";
const LANGUAGE = "en";
const DATASOURCE_DISPLAY_NAME = "KONTA MOY Production EN";
const DATASOURCE_SETTING_KEY = "merchant.google.datasource.en.v1";
const DATASOURCES_API_BASE = "https://merchantapi.googleapis.com/datasources/v1";
const PRODUCTS_API_BASE = "https://merchantapi.googleapis.com/products/v1";
const SHARD_COUNT = 144;
const SYNC_SLOT_MS = 10 * 60_000;
const WRITE_CONCURRENCY = 40;
const RUN_BATCH_TARGET = 2000;
const IMAGE_BATCH_SIZE = 40;
const REFRESH_AFTER_MS = 26 * 24 * 60 * 60 * 1000;
const JOB_NAME = "google-merchant-catalogue-sync-en";
const LEASE_MS = 6 * 60_000;

type EnglishCandidateRow = Readonly<{
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

type PersistedSync = Readonly<{ payload_hash: string | null; last_success_at: Date | string | null }>;

type DataSource = Readonly<{
  name?: string;
  dataSourceId?: string;
  displayName?: string;
  primaryProductDataSource?: Readonly<{
    feedLabel?: string;
    contentLanguage?: string;
    countries?: readonly string[];
  }>;
}>;

type DataSourceListResponse = Readonly<{ dataSources?: readonly DataSource[]; nextPageToken?: string }>;

export type GoogleMerchantEnglishSyncResult = Readonly<{
  status: "synced" | "partial" | "skipped";
  shard: number;
  shardCount: number;
  dataSource: string | null;
  candidates: number;
  submitted: number;
  unchanged: number;
  skippedNoImage: number;
  deleted: number;
  failed: number;
  errors: readonly string[];
}>;

function currentShard(now = Date.now()): number {
  return Math.floor(now / SYNC_SLOT_MS) % SHARD_COUNT;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? "Unknown Merchant English sync error"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function payloadHash(input: GoogleMerchantProductInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5_000, seconds * 1000);
  return [250, 750, 1_500][Math.min(attempt, 2)];
}

async function googleFetch(accessToken: string, url: URL | string, init: RequestInit, label: string): Promise<Response> {
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
        const body = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 700);
        throw new Error(`${label} failed (${response.status}): ${body || response.statusText}`);
      }
      if (attempt < 2) await sleep(retryDelay(attempt, response));
    } catch (error) {
      if (attempt >= 2 || (error instanceof Error && /failed \([34]\d\d\)/.test(error.message))) throw error;
      await sleep(retryDelay(attempt));
    }
  }
  const body = lastResponse ? (await lastResponse.text()).replace(/\s+/g, " ").trim().slice(0, 700) : "";
  throw new Error(`${label} failed (${lastResponse?.status ?? "network"}): ${body}`);
}

async function readStoredDataSource(): Promise<string | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ value: unknown }>(`
    SELECT s.value
    FROM public.system_settings s
    JOIN public.markets m ON m.id=s.market_id
    WHERE m.code='sparta' AND s.key=$1
    LIMIT 1
  `, [DATASOURCE_SETTING_KEY]);
  const value = result.rows[0]?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" && /^accounts\/5849642952\/dataSources\/\d+$/.test(name) ? name : undefined;
}

async function persistDataSource(dataSource: DataSource): Promise<string> {
  const name = dataSource.name?.trim();
  if (!name || !/^accounts\/5849642952\/dataSources\/\d+$/.test(name)) {
    throw new Error("English Merchant data source returned an invalid resource name.");
  }
  const payload = JSON.stringify({
    name,
    dataSourceId: dataSource.dataSourceId ?? name.split("/").at(-1),
    displayName: dataSource.displayName ?? DATASOURCE_DISPLAY_NAME,
    contentLanguage: LANGUAGE,
    feedLabel: FEED_LABEL,
    countries: ["GR"],
    updatedAt: new Date().toISOString()
  });
  await getProductionPostgresRuntime().nativePool.query(`
    INSERT INTO public.system_settings(market_id,key,value,version,updated_by,updated_at)
    SELECT m.id,$1,$2::jsonb,1,NULL,now()
    FROM public.markets m
    WHERE m.code='sparta'
    ON CONFLICT(market_id,key) DO UPDATE SET
      value=excluded.value,
      version=system_settings.version+1,
      updated_by=NULL,
      updated_at=now()
  `, [DATASOURCE_SETTING_KEY, payload]);
  return name;
}

async function ensureEnglishDataSource(accessToken: string): Promise<string> {
  const stored = await readStoredDataSource();
  if (stored) return stored;

  let pageToken: string | undefined;
  do {
    const url = new URL(`${DATASOURCES_API_BASE}/accounts/${ACCOUNT_ID}/dataSources`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await googleFetch(accessToken, url, { method: "GET" }, "Merchant dataSources.list");
    const payload = await response.json() as DataSourceListResponse;
    const existing = (payload.dataSources ?? []).find((source) =>
      source.displayName === DATASOURCE_DISPLAY_NAME
      && source.primaryProductDataSource?.contentLanguage === LANGUAGE
      && source.primaryProductDataSource?.feedLabel === FEED_LABEL
      && source.primaryProductDataSource?.countries?.includes("GR")
    );
    if (existing) return persistDataSource(existing);
    pageToken = payload.nextPageToken;
  } while (pageToken);

  const response = await googleFetch(
    accessToken,
    `${DATASOURCES_API_BASE}/accounts/${ACCOUNT_ID}/dataSources`,
    {
      method: "POST",
      body: JSON.stringify({
        displayName: DATASOURCE_DISPLAY_NAME,
        primaryProductDataSource: {
          feedLabel: FEED_LABEL,
          contentLanguage: LANGUAGE,
          countries: ["GR"]
        }
      })
    },
    "Merchant dataSources.create"
  );
  const created = await response.json() as DataSource;
  return persistDataSource(created);
}

async function loadCandidates(
  shard: number,
  batchTarget = RUN_BATCH_TARGET
): Promise<readonly EnglishCandidateRow[]> {
  const result = await getProductionPostgresRuntime().nativePool.query<EnglishCandidateRow>(`
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
      en.title,
      en.description,
      cv.gtin,
      cv.mpn,
      COALESCE(NULLIF(btrim(rm.brand_name),''),b.name) AS brand_name,
      NULLIF(btrim(rm.color),'') AS color,
      cv.condition,
      lo.live_price_minor AS min_price_minor
    FROM public.canonical_variants cv
    JOIN live_offer lo ON lo.canonical_variant_id=cv.id
    JOIN public.product_translations en
      ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN public.product_translations el
      ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.brands b ON b.id=cv.brand_id
    LEFT JOIN public.storefront_catalog_read_model rm ON rm.canonical_variant_id=cv.id
    LEFT JOIN public.merchant_product_sync mps
      ON mps.merchant_account_id=$1
     AND mps.content_language=$2
     AND mps.feed_label=$3
     AND mps.offer_id=cv.public_id
    WHERE cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND nullif(btrim(en.title),'') IS NOT NULL
      AND nullif(btrim(coalesce(en.description,'')),'') IS NOT NULL
      AND NOT (
        nullif(btrim(el.title),'') IS NOT NULL
        AND nullif(btrim(coalesce(el.description,'')),'') IS NOT NULL
      )
      AND (
        mps.id IS NULL
        OR mps.sync_status<>'synced'
        OR mod(abs(hashtext(cv.public_id)::bigint),$4::bigint)=$5::bigint
      )
    ORDER BY
      CASE WHEN mps.id IS NULL OR mps.sync_status<>'synced' THEN 0 ELSE 1 END,
      mps.last_success_at NULLS FIRST,
      cv.public_id
    LIMIT $6
  `, [ACCOUNT_ID, LANGUAGE, FEED_LABEL, SHARD_COUNT, shard, batchTarget]);
  return result.rows;
}function toCandidate(row: EnglishCandidateRow): GoogleMerchantCandidate {
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
    priceMinor: row.min_price_minor,
    contentLanguage: LANGUAGE
  };
}

async function productImages(rows: readonly EnglishCandidateRow[]): Promise<ReadonlyMap<string, string>> {
  const images = new Map<string, string>();
  const origin = publicOrigin();
  try {
    const approved = await approvedCatalogImages(rows.map((row) => ({ canonicalVariantId: row.canonical_public_id })));
    for (const image of approved) {
      images.set(image.canonicalVariantId, new URL(`/api/media/${encodeURIComponent(image.mediaId)}`, origin).toString());
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "merchant.en.approved_media_projection_failed", message: errorText(error) }));
  }
  const unresolved = rows.filter((row) => !images.has(row.canonical_public_id));
  for (let offset = 0; offset < unresolved.length; offset += IMAGE_BATCH_SIZE) {
    const batch = unresolved.slice(offset, offset + IMAGE_BATCH_SIZE);
    const resolved = await getPublicCatalogSourcePrimaryImages(batch.map((row) => ({ canonicalVariantId: row.canonical_public_id })));
    for (const [id, image] of resolved) images.set(id, image.src);
  }
  return images;
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

async function loadPersisted(offerIds: readonly string[]): Promise<Map<string, PersistedSync>> {
  if (!offerIds.length) return new Map();
  const result = await getProductionPostgresRuntime().nativePool.query<{
    offer_id: string;
    payload_hash: string | null;
    last_success_at: Date | string | null;
  }>(`
    SELECT offer_id,payload_hash,last_success_at
    FROM public.merchant_product_sync
    WHERE merchant_account_id=$1
      AND content_language=$2
      AND feed_label=$3
      AND offer_id=ANY($4::text[])
  `, [ACCOUNT_ID, LANGUAGE, FEED_LABEL, offerIds]);
  return new Map(result.rows.map((row) => [row.offer_id, row]));
}

function requiresRefresh(state: PersistedSync | undefined, hash: string, now: number): boolean {
  if (!state || state.payload_hash !== hash || !state.last_success_at) return true;
  return now - new Date(state.last_success_at).getTime() >= REFRESH_AFTER_MS;
}

async function insertProduct(
  accessToken: string,
  dataSource: string,
  input: GoogleMerchantProductInput
): Promise<{ name?: string }> {
  const url = new URL(`${PRODUCTS_API_BASE}/accounts/${ACCOUNT_ID}/productInputs:insert`);
  url.searchParams.set("dataSource", dataSource);
  const response = await googleFetch(
    accessToken,
    url,
    { method: "POST", body: JSON.stringify(input) },
    `Merchant EN insert ${input.offerId}`
  );
  return await response.json() as { name?: string };
}

async function persistSuccess(
  dataSource: string,
  row: EnglishCandidateRow,
  input: GoogleMerchantProductInput,
  hash: string,
  response: { name?: string }
): Promise<void> {
  const inputName = response.name
    || `accounts/${ACCOUNT_ID}/productInputs/${googleMerchantProductInputSegment(LANGUAGE, FEED_LABEL, input.offerId)}`;
  await getProductionPostgresRuntime().nativePool.query(`
    INSERT INTO public.merchant_product_sync(
      canonical_variant_id,offer_id,merchant_account_id,data_source_name,content_language,feed_label,
      product_input_name,payload_hash,last_submitted_payload,sync_status,last_sync_at,last_success_at,
      retry_count,last_error_code,last_error_message,first_synced_at,updated_at
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'synced',now(),now(),0,NULL,NULL,now(),now())
    ON CONFLICT(merchant_account_id,content_language,feed_label,offer_id) DO UPDATE SET
      canonical_variant_id=excluded.canonical_variant_id,
      data_source_name=excluded.data_source_name,
      product_input_name=excluded.product_input_name,
      payload_hash=excluded.payload_hash,
      last_submitted_payload=excluded.last_submitted_payload,
      sync_status='synced',
      last_sync_at=now(),
      last_success_at=now(),
      retry_count=0,
      next_retry_at=NULL,
      last_error_code=NULL,
      last_error_message=NULL,
      first_synced_at=coalesce(merchant_product_sync.first_synced_at,now()),
      updated_at=now()
  `, [
    row.canonical_variant_id,
    input.offerId,
    ACCOUNT_ID,
    dataSource,
    LANGUAGE,
    FEED_LABEL,
    inputName,
    hash,
    JSON.stringify(input)
  ]);
}

async function persistFailure(
  dataSource: string,
  row: EnglishCandidateRow,
  input: GoogleMerchantProductInput,
  hash: string,
  message: string
): Promise<void> {
  await getProductionPostgresRuntime().nativePool.query(`
    INSERT INTO public.merchant_product_sync(
      canonical_variant_id,offer_id,merchant_account_id,data_source_name,content_language,feed_label,
      payload_hash,last_submitted_payload,sync_status,last_sync_at,retry_count,next_retry_at,last_error_message,updated_at
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'failed',now(),1,now()+interval '15 minutes',$9,now())
    ON CONFLICT(merchant_account_id,content_language,feed_label,offer_id) DO UPDATE SET
      canonical_variant_id=excluded.canonical_variant_id,
      data_source_name=excluded.data_source_name,
      payload_hash=excluded.payload_hash,
      last_submitted_payload=excluded.last_submitted_payload,
      sync_status='failed',
      last_sync_at=now(),
      retry_count=merchant_product_sync.retry_count+1,
      next_retry_at=now()+least(interval '12 hours', interval '15 minutes' * power(2,least(merchant_product_sync.retry_count,5))),
      last_error_message=excluded.last_error_message,
      updated_at=now()
  `, [
    row.canonical_variant_id,
    input.offerId,
    ACCOUNT_ID,
    dataSource,
    LANGUAGE,
    FEED_LABEL,
    hash,
    JSON.stringify(input),
    message
  ]);
}

async function loadStaleOfferIds(shard: number): Promise<readonly string[]> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ offer_id: string }>(`
    WITH live_english AS (
      SELECT DISTINCT cv.public_id AS offer_id
      FROM public.canonical_variants cv
      JOIN public.product_translations en
        ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN public.product_translations el
        ON el.canonical_variant_id=cv.id AND el.locale='el'
      JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
      JOIN public.vendor_businesses v ON v.id=vo.vendor_id
      JOIN public.vendor_locations l ON l.id=vo.location_id
      LEFT JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      LEFT JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id
      WHERE cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND nullif(btrim(en.title),'') IS NOT NULL
        AND nullif(btrim(coalesce(en.description,'')),'') IS NOT NULL
        AND NOT (
          nullif(btrim(el.title),'') IS NOT NULL
          AND nullif(btrim(coalesce(el.description,'')),'') IS NOT NULL
        )
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
    )
    SELECT mps.offer_id
    FROM public.merchant_product_sync mps
    LEFT JOIN live_english le ON le.offer_id=mps.offer_id
    WHERE mps.merchant_account_id=$1
      AND mps.content_language=$2
      AND mps.feed_label=$3
      AND mps.sync_status='synced'
      AND le.offer_id IS NULL
      AND mod(abs(hashtext(mps.offer_id)::bigint),$4::bigint)=$5::bigint
    ORDER BY mps.offer_id
  `, [ACCOUNT_ID, LANGUAGE, FEED_LABEL, SHARD_COUNT, shard]);
  return result.rows.map((row) => row.offer_id);
}
async function deleteProduct(accessToken: string, dataSource: string, offerId: string): Promise<void> {
  const segment = googleMerchantProductInputSegment(LANGUAGE, FEED_LABEL, offerId);
  const url = new URL(`${PRODUCTS_API_BASE}/accounts/${ACCOUNT_ID}/productInputs/${segment}`);
  url.searchParams.set("dataSource", dataSource);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok && response.status !== 404) {
    const body = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 500);
    throw new Error(`Merchant EN delete ${offerId} failed (${response.status}): ${body}`);
  }
  await getProductionPostgresRuntime().nativePool.query(`
    UPDATE public.merchant_product_sync
    SET sync_status='deleted',updated_at=now()
    WHERE merchant_account_id=$1
      AND content_language=$2
      AND feed_label=$3
      AND offer_id=$4
  `, [ACCOUNT_ID, LANGUAGE, FEED_LABEL, offerId]);
}

export async function syncGoogleMerchantEnglishFallback(now = Date.now()): Promise<GoogleMerchantEnglishSyncResult> {
  const shard = currentShard(now);
  const empty = {
    shard,
    shardCount: SHARD_COUNT,
    dataSource: null,
    candidates: 0,
    submitted: 0,
    unchanged: 0,
    skippedNoImage: 0,
    deleted: 0,
    failed: 0,
    errors: [] as string[]
  };
  if (!productionDatabaseConfigured()) return { status: "skipped", ...empty };

  const pool = getProductionPostgresRuntime().nativePool;
  const leaseOwner = `merchant-en:${randomUUID()}`;
  const lease = await pool.query<{ lock_owner: string }>(`
    INSERT INTO public.scheduled_jobs(
      name,next_run_at,lock_owner,locked_until,last_started_at,last_succeeded_at,
      consecutive_failures,last_error,updated_at
    )
    VALUES($1,$2,$3,$4,$2,NULL,0,NULL,$2)
    ON CONFLICT(name) DO UPDATE SET
      lock_owner=excluded.lock_owner,
      locked_until=excluded.locked_until,
      last_started_at=excluded.last_started_at,
      updated_at=excluded.updated_at
    WHERE scheduled_jobs.locked_until IS NULL
       OR scheduled_jobs.locked_until<=excluded.last_started_at
    RETURNING lock_owner
  `, [JOB_NAME, new Date(now), leaseOwner, new Date(now + LEASE_MS)]);
  if (lease.rows[0]?.lock_owner !== leaseOwner) return { status: "skipped", ...empty };

  let completed = false;
  let failureMessage: string | undefined;
  const run = await pool.query<{ id: string }>(`
    INSERT INTO public.merchant_sync_runs(run_type,status,shard,shard_count)
    VALUES('catalogue_sync_en','running',$1,$2)
    RETURNING id
  `, [shard, SHARD_COUNT]);
  const runId = run.rows[0]?.id;

  try {
    const accessToken = await getGoogleMerchantAccessToken();
    const dataSource = await ensureEnglishDataSource(accessToken);
    const rows = await loadCandidates(shard, RUN_BATCH_TARGET);
    const images = await productImages(rows);
    const errors: string[] = [];
    let submitted = 0;
    let unchanged = 0;
    let skippedNoImage = 0;
    let deleted = 0;
    let failed = 0;

    const prepared = rows.flatMap((row) => {
      const image = images.get(row.canonical_public_id);
      if (!image) {
        skippedNoImage += 1;
        return [];
      }
      try {
        const input = buildGoogleMerchantProductInput(toCandidate(row), image, publicOrigin());
        return [{ row, input, hash: payloadHash(input) }];
      } catch (error) {
        failed += 1;
        if (errors.length < 10) errors.push(errorText(error));
        return [];
      }
    });

    const persisted = await loadPersisted(prepared.map((item) => item.input.offerId));
    const changed = prepared.filter((item) => {
      const needed = requiresRefresh(persisted.get(item.input.offerId), item.hash, now);
      if (!needed) unchanged += 1;
      return needed;
    });

    const quota = await getMerchantProductInsertQuota(accessToken, ACCOUNT_ID);
    const plan = merchantWritePlan(quota, Math.min(RUN_BATCH_TARGET, changed.length));
    const writable = changed.slice(0, plan.allowed);
    const quotaDeferred = Math.max(0, changed.length - writable.length);
    if (quotaDeferred > 0 && errors.length < 10) {
      errors.push(`Merchant quota deferred ${quotaDeferred} writes; dailyRemaining=${quota.dailyRemaining}, minuteLimit=${quota.minuteLimit}.`);
    }

    await runMerchantWritesQuotaAware(writable, quota, WRITE_CONCURRENCY, async ({ row, input, hash }) => {
      try {
        const response = await insertProduct(accessToken, dataSource, input);
        await persistSuccess(dataSource, row, input, hash, response);
        submitted += 1;
      } catch (error) {
        failed += 1;
        const message = errorText(error);
        await persistFailure(dataSource, row, input, hash, message).catch(() => undefined);
        if (errors.length < 10) errors.push(message);
      }
    });

    const stale = await loadStaleOfferIds(shard);
    await mapConcurrent(stale, WRITE_CONCURRENCY, async (offerId) => {
      try {
        await deleteProduct(accessToken, dataSource, offerId);
        deleted += 1;
      } catch (error) {
        failed += 1;
        if (errors.length < 10) errors.push(errorText(error));
      }
    });

    const status = failed > 0 ? "partial" : "synced" as const;
    if (runId) {
      await pool.query(`
        UPDATE public.merchant_sync_runs
        SET status=$2,
            queued_count=$3,
            attempted_count=$4,
            submitted_count=$5,
            unchanged_count=$6,
            deleted_count=$7,
            failed_count=$8,
            metadata=$9::jsonb,
            finished_at=now()
        WHERE id=$1
      `, [
        runId,
        status,
        rows.length,
        changed.length,
        submitted,
        unchanged,
        deleted,
        failed,
        JSON.stringify({ skippedNoImage, dataSource, errors })
      ]);
    }
    completed = true;
    return {
      status,
      shard,
      shardCount: SHARD_COUNT,
      dataSource,
      candidates: rows.length,
      submitted,
      unchanged,
      skippedNoImage,
      deleted,
      failed,
      errors
    };
  } catch (error) {
    failureMessage = errorText(error);
    if (runId) {
      await pool.query(`
        UPDATE public.merchant_sync_runs
        SET status='failed',
            failed_count=failed_count+1,
            metadata=jsonb_build_object('error',$2),
            finished_at=now()
        WHERE id=$1
      `, [runId, failureMessage]).catch(() => undefined);
    }
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
      JOB_NAME,
      finishedAt,
      failureMessage?.slice(0, 1000) ?? null,
      completed,
      leaseOwner
    ]).catch(() => undefined);
  }
}
