import { createHash, randomUUID } from "node:crypto";
import { S3ObjectStorage, objectStorageConfigFromEnv, type StoredObjectRead } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getPublicProductSeoSummary } from "./catalog-view";
import { approvedCatalogImageGallery } from "./public-product-media-gallery";
import { readApprovedPublicMedia } from "./public-media-service";
import { getPublicCatalogSourceImageAtIndex } from "./public-catalog-source-gallery";
import {
  TRYON_IMAGE_CONTENT_TYPES,
  TRYON_MODEL_PROVIDER,
  TRYON_MODEL_VERSION,
  TRYON_PREVIEW_TTL_MS,
  TRYON_REFERENCE_MAX_BYTES,
  privateTryOnUserKey,
  resolveVirtualTryOnCategory,
  virtualTryOnCacheKey,
  type VirtualTryOnCategory
} from "./virtual-try-on";

const OUTPUT_CONTENT_TYPE = "image/webp";
const GENERATED_MAX_BYTES = 20 * 1024 * 1024;
const GENERATION_LEASE_MS = 90_000;
const UPLOAD_INTENT_TTL_MS = 10 * 60 * 1000;
const GENERATION_RATE_LIMIT_PER_MINUTE = 20;
const FASHN_CONSENT_VERSION = "virtual-try-on-2026-10";

let storageSingleton: S3ObjectStorage | undefined;
const storage = () => storageSingleton ??= new S3ObjectStorage(objectStorageConfigFromEnv(process.env));

type UserRow = { id: string };
type ProfileRow = {
  public_id: string;
  user_uuid: string;
  reference_object_key: string;
  content_type: string;
  byte_size: number | string;
  photo_version: number | string;
  consent_version: string;
  consented_at: Date | string;
  updated_at: Date | string;
};
type IntentRow = {
  public_id: string;
  user_uuid: string;
  object_key: string;
  content_type: string;
  expected_byte_size: number | string;
  consent_version: string;
  status: string;
  expires_at: Date | string;
};
type PreviewRow = {
  public_id: string;
  user_uuid: string;
  canonical_public_id: string;
  slug: string;
  title: string;
  profile_version: number | string;
  garment_category: VirtualTryOnCategory;
  garment_fingerprint: string;
  cache_key: string;
  object_key: string;
  content_type?: string | null;
  byte_size?: number | string | null;
  status: "generating" | "ready" | "failed" | "expired" | "saved";
  expires_at?: Date | string | null;
  saved_at?: Date | string | null;
  generated_at?: Date | string | null;
  last_accessed_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CustomerTryOnProfile = Readonly<{
  id: string;
  photoVersion: number;
  contentType: string;
  byteSize: number;
  consentVersion: string;
  consentedAt: string;
  updatedAt: string;
}>;

export type CustomerTryOnPreview = Readonly<{
  id: string;
  canonicalVariantId: string;
  slug: string;
  title: string;
  category: VirtualTryOnCategory;
  status: PreviewRow["status"];
  saved: boolean;
  expiresAt?: string;
  generatedAt?: string;
  createdAt: string;
  imageUrl: string;
}>;

export type TryOnGenerationResult =
  | Readonly<{ status: "ready"; preview: CustomerTryOnPreview; cached: boolean }>
  | Readonly<{ status: "processing"; previewId: string }>;

export function tryOnFeatureEnabled(): boolean {
  return process.env.BLS_TRYON_ENABLED === "true";
}

export function tryOnServiceConfigured(): boolean {
  return tryOnFeatureEnabled()
    && Boolean(process.env.BLS_TRYON_SERVICE_URL?.trim())
    && Boolean(process.env.BLS_TRYON_SERVICE_TOKEN?.trim())
    && productionDatabaseConfigured();
}

export function tryOnConsentVersion(): string {
  return FASHN_CONSENT_VERSION;
}

function ensureTryOnStorage(): void {
  if (!productionDatabaseConfigured()) throw new Error("TRYON_DATABASE_UNAVAILABLE");
  if (!(process.env.BLS_OBJECT_STORAGE_BUCKET?.trim() || process.env.OBJECT_STORAGE_BUCKET?.trim())) throw new Error("TRYON_STORAGE_UNAVAILABLE");
}

function safeFilename(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replaceAll("\\", "/").split("/").pop()?.trim().slice(0, 240) || "reference-photo";
}

function normalizedContentType(value: string): string {
  return value.split(";")[0]!.trim().toLowerCase();
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("TRYON_INVALID_DATABASE_NUMBER");
  return parsed;
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function customerUser(userPublicId: string): Promise<UserRow> {
  const result = await getProductionPostgresRuntime().nativePool.query<UserRow>(
    "SELECT id::text AS id FROM public.users WHERE public_id=$1 OR id::text=$1 ORDER BY (public_id=$1) DESC LIMIT 1",
    [userPublicId]
  );
  const row = result.rows[0];
  if (!row) throw new Error("CUSTOMER_NOT_FOUND");
  return row;
}

function rowToProfile(row: ProfileRow): CustomerTryOnProfile {
  return {
    id: String(row.public_id),
    photoVersion: numberValue(row.photo_version),
    contentType: row.content_type,
    byteSize: numberValue(row.byte_size),
    consentVersion: row.consent_version,
    consentedAt: iso(row.consented_at)!,
    updatedAt: iso(row.updated_at)!
  };
}

function rowToPreview(row: PreviewRow): CustomerTryOnPreview {
  return {
    id: String(row.public_id),
    canonicalVariantId: row.canonical_public_id,
    slug: row.slug,
    title: row.title,
    category: row.garment_category,
    status: row.status,
    saved: row.status === "saved" || Boolean(row.saved_at),
    expiresAt: iso(row.expires_at),
    generatedAt: iso(row.generated_at),
    createdAt: iso(row.created_at)!,
    imageUrl: `/api/account/try-on/previews/${encodeURIComponent(String(row.public_id))}`
  };
}

const PROFILE_SELECT = `
  p.public_id,u.id::text AS user_uuid,p.reference_object_key,p.content_type,p.byte_size,
  p.photo_version,p.consent_version,p.consented_at,p.updated_at
`;

const PREVIEW_SELECT = `
  p.public_id,u.id::text AS user_uuid,cv.public_id AS canonical_public_id,cv.slug,
  COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
  p.profile_version,p.garment_category,p.garment_fingerprint,p.cache_key,p.object_key,
  p.content_type,p.byte_size,p.status,p.expires_at,p.saved_at,p.generated_at,
  p.last_accessed_at,p.created_at,p.updated_at
`;

export async function getCustomerTryOnProfile(userPublicId: string): Promise<CustomerTryOnProfile | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().nativePool.query<ProfileRow>(`
    SELECT ${PROFILE_SELECT}
    FROM public.customer_tryon_profiles p
    JOIN public.users u ON u.id=p.user_id
    WHERE u.public_id=$1 OR u.id::text=$1
    LIMIT 1
  `, [userPublicId]);
  return result.rows[0] ? rowToProfile(result.rows[0]) : undefined;
}

export async function createCustomerTryOnUploadIntent(input: {
  userPublicId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  consentAccepted: boolean;
}): Promise<Readonly<{ intentId: string; uploadUrl: string; headers: Readonly<Record<string,string>>; expiresAt: string }>> {
  ensureTryOnStorage();
  if (!input.consentAccepted) throw new Error("TRYON_CONSENT_REQUIRED");
  const contentType = normalizedContentType(input.contentType);
  if (!TRYON_IMAGE_CONTENT_TYPES.has(contentType)) throw new Error("TRYON_REFERENCE_IMAGE_TYPE");
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > TRYON_REFERENCE_MAX_BYTES) throw new Error("TRYON_REFERENCE_IMAGE_SIZE");
  const user = await customerUser(input.userPublicId);
  const now = Date.now();
  const expiresAt = new Date(now + UPLOAD_INTENT_TTL_MS);
  const objectKey = `private/customer-tryon/${privateTryOnUserKey(input.userPublicId)}/profile/${randomUUID()}`;
  const result = await getProductionPostgresRuntime().nativePool.query<{ public_id: string }>(`
    INSERT INTO public.customer_tryon_upload_intents(
      user_id,object_key,original_filename,content_type,expected_byte_size,consent_version,expires_at
    ) VALUES($1::uuid,$2,$3,$4,$5,$6,$7)
    RETURNING public_id::text AS public_id
  `, [user.id, objectKey, safeFilename(input.filename), contentType, input.byteSize, FASHN_CONSENT_VERSION, expiresAt]);
  const intentId = String(result.rows[0]?.public_id || "");
  if (!intentId) throw new Error("TRYON_UPLOAD_INTENT_FAILED");
  try {
    const signed = await storage().createUploadUrl({ objectKey, contentType, expiresInSeconds: 600 });
    return { intentId, uploadUrl: signed.url, headers: signed.headers, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    await getProductionPostgresRuntime().nativePool.query(
      "UPDATE public.customer_tryon_upload_intents SET status='failed',failure_reason=$2 WHERE public_id::text=$1",
      [intentId, error instanceof Error ? error.message.slice(0, 500) : "storage_signing_failed"]
    ).catch(() => undefined);
    throw error;
  }
}

export async function completeCustomerTryOnUpload(userPublicId: string, intentId: string): Promise<CustomerTryOnProfile> {
  ensureTryOnStorage();
  const runtime = getProductionPostgresRuntime();
  const lookup = await runtime.nativePool.query<IntentRow>(`
    SELECT i.public_id::text AS public_id,u.id::text AS user_uuid,i.object_key,i.content_type,
           i.expected_byte_size,i.consent_version,i.status,i.expires_at
    FROM public.customer_tryon_upload_intents i
    JOIN public.users u ON u.id=i.user_id
    WHERE i.public_id::text=$1 AND (u.public_id=$2 OR u.id::text=$2)
    LIMIT 1
  `, [intentId, userPublicId]);
  const intent = lookup.rows[0];
  if (!intent) throw new Error("TRYON_UPLOAD_INTENT_NOT_FOUND");
  if (intent.status !== "initiated") throw new Error("TRYON_UPLOAD_INTENT_NOT_ACTIVE");
  if (new Date(intent.expires_at).getTime() <= Date.now()) throw new Error("TRYON_UPLOAD_INTENT_EXPIRED");

  const metadata = await storage().head(intent.object_key);
  if (!metadata) throw new Error("TRYON_REFERENCE_IMAGE_MISSING");
  const contentType = normalizedContentType(metadata.contentType || "");
  if (contentType !== intent.content_type || metadata.byteSize !== numberValue(intent.expected_byte_size)) throw new Error("TRYON_REFERENCE_IMAGE_MISMATCH");

  const client = await runtime.nativePool.connect();
  let previousObjectKey: string | undefined;
  let profileRow: ProfileRow | undefined;
  try {
    await client.query("BEGIN");
    const previous = await client.query<{ reference_object_key: string; photo_version: number | string }>(
      "SELECT reference_object_key,photo_version FROM public.customer_tryon_profiles WHERE user_id=$1::uuid FOR UPDATE",
      [intent.user_uuid]
    );
    previousObjectKey = previous.rows[0]?.reference_object_key;
    const saved = await client.query<ProfileRow>(`
      INSERT INTO public.customer_tryon_profiles(
        user_id,reference_object_key,content_type,byte_size,photo_version,consent_version,consented_at,updated_at
      ) VALUES($1::uuid,$2,$3,$4,1,$5,now(),now())
      ON CONFLICT(user_id) DO UPDATE SET
        reference_object_key=EXCLUDED.reference_object_key,
        content_type=EXCLUDED.content_type,
        byte_size=EXCLUDED.byte_size,
        photo_version=public.customer_tryon_profiles.photo_version+1,
        consent_version=EXCLUDED.consent_version,
        consented_at=now(),
        updated_at=now()
      RETURNING public_id,$1::text AS user_uuid,reference_object_key,content_type,byte_size,
                photo_version,consent_version,consented_at,updated_at
    `, [intent.user_uuid, intent.object_key, contentType, metadata.byteSize, intent.consent_version]);
    profileRow = saved.rows[0];
    await client.query(
      "UPDATE public.customer_tryon_upload_intents SET status='completed',completed_at=now(),failure_reason=NULL WHERE public_id::text=$1",
      [intentId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (!profileRow) throw new Error("TRYON_PROFILE_SAVE_FAILED");
  if (previousObjectKey && previousObjectKey !== intent.object_key) await storage().delete(previousObjectKey).catch(() => undefined);
  return rowToProfile(profileRow);
}

export async function deleteCustomerTryOnProfile(userPublicId: string, deleteSavedLooks = false): Promise<boolean> {
  if (!productionDatabaseConfigured()) return false;
  const runtime = getProductionPostgresRuntime();
  const user = await customerUser(userPublicId);
  const profile = await runtime.nativePool.query<{ reference_object_key: string }>(
    "DELETE FROM public.customer_tryon_profiles WHERE user_id=$1::uuid RETURNING reference_object_key",
    [user.id]
  );
  const previews = await runtime.nativePool.query<{ public_id: string; object_key: string }>(`
    DELETE FROM public.customer_tryon_previews
    WHERE user_id=$1::uuid AND ($2::boolean OR saved_at IS NULL)
    RETURNING public_id::text AS public_id,object_key
  `, [user.id, deleteSavedLooks]);
  await Promise.allSettled([
    ...(profile.rows[0]?.reference_object_key ? [storage().delete(profile.rows[0].reference_object_key)] : []),
    ...previews.rows.map((row) => storage().delete(row.object_key))
  ]);
  return Boolean(profile.rowCount);
}

async function streamToBuffer(source: StoredObjectRead, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const raw of source.stream) {
    const chunk = Buffer.from(raw);
    total += chunk.length;
    if (total > maxBytes) throw new Error("TRYON_IMAGE_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function responseImageBuffer(response: Response, maxBytes: number): Promise<Readonly<{ bytes: Buffer; contentType: string }>> {
  if (!response.ok) throw new Error(`TRYON_IMAGE_FETCH_${response.status}`);
  const contentType = normalizedContentType(response.headers.get("content-type") || "");
  if (!TRYON_IMAGE_CONTENT_TYPES.has(contentType)) throw new Error("TRYON_IMAGE_FETCH_TYPE");
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > maxBytes) throw new Error("TRYON_IMAGE_TOO_LARGE");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) throw new Error("TRYON_IMAGE_TOO_LARGE");
  return { bytes, contentType };
}

async function governedGarment(canonicalVariantId: string): Promise<Readonly<{ bytes: Buffer; contentType: string; fingerprint: string }>> {
  const gallery = await approvedCatalogImageGallery({ canonicalVariantId }, 1);
  const media = gallery[0];
  if (media) {
    const source = await readApprovedPublicMedia(media.mediaId);
    if (source) {
      const bytes = await streamToBuffer(source, GENERATED_MAX_BYTES);
      const fingerprint = `media:${media.mediaId}:${source.etag || createHash("sha256").update(bytes).digest("hex")}`;
      return { bytes, contentType: source.contentType, fingerprint };
    }
  }
  const sourceImage = await getPublicCatalogSourceImageAtIndex(canonicalVariantId, 0);
  if (!sourceImage) throw new Error("TRYON_GARMENT_IMAGE_UNAVAILABLE");
  const response = await fetch(sourceImage.src, {
    method: "GET",
    redirect: "error",
    cache: "no-store",
    headers: { "accept": "image/webp,image/png,image/jpeg,image/*;q=0.8", "user-agent": "KONTA-MOU-Virtual-TryOn/1.0" },
    signal: AbortSignal.timeout(15_000)
  });
  const fetched = await responseImageBuffer(response, GENERATED_MAX_BYTES);
  return {
    ...fetched,
    fingerprint: `source:${createHash("sha256").update(fetched.bytes).digest("hex")}`
  };
}

async function profileRowForUser(userPublicId: string): Promise<ProfileRow | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<ProfileRow>(`
    SELECT ${PROFILE_SELECT}
    FROM public.customer_tryon_profiles p
    JOIN public.users u ON u.id=p.user_id
    WHERE u.public_id=$1 OR u.id::text=$1
    LIMIT 1
  `, [userPublicId]);
  return result.rows[0];
}

async function invokeFashn(input: Readonly<{
  person: Buffer;
  personContentType: string;
  garment: Buffer;
  garmentContentType: string;
  category: VirtualTryOnCategory;
}>): Promise<Buffer> {
  const serviceUrl = process.env.BLS_TRYON_SERVICE_URL?.trim();
  const token = process.env.BLS_TRYON_SERVICE_TOKEN?.trim();
  if (!tryOnFeatureEnabled() || !serviceUrl || !token) throw new Error("TRYON_SERVICE_UNAVAILABLE");
  const timeoutMs = positiveInteger(process.env.BLS_TRYON_REQUEST_TIMEOUT_MS, 55_000);
  const timesteps = Math.min(50, Math.max(20, positiveInteger(process.env.BLS_TRYON_FASHN_TIMESTEPS, 30)));
  const form = new FormData();
  form.append("person", new Blob([new Uint8Array(input.person)], { type: input.personContentType }), "person");
  form.append("garment", new Blob([new Uint8Array(input.garment)], { type: input.garmentContentType }), "garment");
  form.append("category", input.category);
  form.append("garment_photo_type", process.env.BLS_TRYON_FASHN_GARMENT_PHOTO_TYPE === "flat-lay" ? "flat-lay" : "model");
  form.append("num_timesteps", String(timesteps));
  form.append("guidance_scale", process.env.BLS_TRYON_FASHN_GUIDANCE_SCALE?.trim() || "1.5");
  form.append("segmentation_free", "true");

  const response = await fetch(new URL("/v1/try-on", serviceUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`TRYON_SERVICE_${response.status}${detail ? `:${detail}` : ""}`);
  }
  const outputType = normalizedContentType(response.headers.get("content-type") || "");
  if (!TRYON_IMAGE_CONTENT_TYPES.has(outputType)) throw new Error("TRYON_SERVICE_OUTPUT_TYPE");
  const output = Buffer.from(await response.arrayBuffer());
  if (!output.length || output.length > GENERATED_MAX_BYTES) throw new Error("TRYON_SERVICE_OUTPUT_SIZE");
  return output;
}

async function uploadGeneratedObject(objectKey: string, bytes: Buffer): Promise<number> {
  const signed = await storage().createUploadUrl({ objectKey, contentType: OUTPUT_CONTENT_TYPE, expiresInSeconds: 300 });
  const response = await fetch(signed.url, {
    method: "PUT",
    headers: signed.headers,
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`TRYON_OUTPUT_UPLOAD_${response.status}`);
  const metadata = await storage().head(objectKey);
  if (!metadata || metadata.byteSize !== bytes.length) throw new Error("TRYON_OUTPUT_UPLOAD_VERIFY");
  return metadata.byteSize;
}

async function cachedPreview(userUuid: string, cacheKey: string): Promise<PreviewRow | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<PreviewRow>(`
    SELECT ${PREVIEW_SELECT}
    FROM public.customer_tryon_previews p
    JOIN public.users u ON u.id=p.user_id
    JOIN public.canonical_variants cv ON cv.id=p.canonical_variant_id
    LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE p.user_id=$1::uuid AND p.cache_key=$2
    LIMIT 1
  `, [userUuid, cacheKey]);
  return result.rows[0];
}

export async function generateCustomerTryOnPreview(userPublicId: string, canonicalVariantId: string): Promise<TryOnGenerationResult> {
  ensureTryOnStorage();
  if (!tryOnServiceConfigured()) throw new Error("TRYON_SERVICE_UNAVAILABLE");
  const product = await getPublicProductSeoSummary(canonicalVariantId);
  if (!product) throw new Error("TRYON_PRODUCT_NOT_FOUND");
  const category = resolveVirtualTryOnCategory({ title: product.title, categoryCode: product.categoryCode, categoryLabel: product.categoryLabel });
  if (!category) throw new Error("TRYON_PRODUCT_UNSUPPORTED");

  const profile = await profileRowForUser(userPublicId);
  if (!profile) throw new Error("TRYON_PROFILE_REQUIRED");
  const garment = await governedGarment(product.id);
  const profileVersion = numberValue(profile.photo_version);
  const cacheKey = virtualTryOnCacheKey({
    userId: userPublicId,
    profileVersion,
    canonicalVariantId: product.id,
    garmentFingerprint: garment.fingerprint,
    category
  });
  const now = Date.now();
  const existing = await cachedPreview(profile.user_uuid, cacheKey);
  if (existing?.status === "saved") return { status: "ready", preview: rowToPreview(existing), cached: true };
  if (existing?.status === "ready" && existing.expires_at && new Date(existing.expires_at).getTime() > now) {
    const expiresAt = new Date(now + TRYON_PREVIEW_TTL_MS);
    await getProductionPostgresRuntime().nativePool.query(
      "UPDATE public.customer_tryon_previews SET expires_at=$3,last_accessed_at=$2,updated_at=$2 WHERE user_id=$1::uuid AND cache_key=$4",
      [profile.user_uuid, new Date(now), expiresAt, cacheKey]
    );
    return { status: "ready", preview: rowToPreview({ ...existing, expires_at: expiresAt, last_accessed_at: new Date(now), updated_at: new Date(now) }), cached: true };
  }
  if (existing?.status === "generating" && new Date(existing.updated_at).getTime() > now - GENERATION_LEASE_MS) {
    return { status: "processing", previewId: existing.public_id };
  }

  const rate = await getProductionPostgresRuntime().nativePool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM public.customer_tryon_previews WHERE user_id=$1::uuid AND created_at>now()-interval '1 minute'",
    [profile.user_uuid]
  );
  if (Number(rate.rows[0]?.count || 0) >= GENERATION_RATE_LIMIT_PER_MINUTE) throw new Error("TRYON_RATE_LIMIT");

  const objectKey = `private/customer-tryon/${privateTryOnUserKey(userPublicId)}/previews/${cacheKey}.webp`;
  const claimed = await getProductionPostgresRuntime().nativePool.query<{ public_id: string }>(`
    INSERT INTO public.customer_tryon_previews(
      user_id,canonical_variant_id,profile_version,provider,model_version,garment_category,
      garment_fingerprint,cache_key,object_key,status,created_at,updated_at
    )
    SELECT $1::uuid,cv.id,$3,$4,$5,$6,$7,$8,$9,'generating',now(),now()
    FROM public.canonical_variants cv
    WHERE cv.public_id=$2
    ON CONFLICT(user_id,cache_key) DO UPDATE SET
      canonical_variant_id=EXCLUDED.canonical_variant_id,
      profile_version=EXCLUDED.profile_version,
      provider=EXCLUDED.provider,
      model_version=EXCLUDED.model_version,
      garment_category=EXCLUDED.garment_category,
      garment_fingerprint=EXCLUDED.garment_fingerprint,
      object_key=EXCLUDED.object_key,
      content_type=NULL,
      byte_size=NULL,
      status='generating',
      expires_at=NULL,
      saved_at=NULL,
      generated_at=NULL,
      failure_reason=NULL,
      updated_at=now()
    WHERE public.customer_tryon_previews.status IN ('failed','expired')
       OR (public.customer_tryon_previews.status='ready' AND public.customer_tryon_previews.expires_at<=now())
       OR (public.customer_tryon_previews.status='generating' AND public.customer_tryon_previews.updated_at<=now()-interval '90 seconds')
    RETURNING public_id::text AS public_id
  `, [profile.user_uuid, product.id, profileVersion, TRYON_MODEL_PROVIDER, TRYON_MODEL_VERSION, category, garment.fingerprint, cacheKey, objectKey]);
  if (!claimed.rowCount) {
    const current = await cachedPreview(profile.user_uuid, cacheKey);
    if (current?.status === "saved" || (current?.status === "ready" && current.expires_at && new Date(current.expires_at).getTime() > Date.now())) {
      return { status: "ready", preview: rowToPreview(current), cached: true };
    }
    return { status: "processing", previewId: current?.public_id || "" };
  }

  try {
    const personObject = await storage().read(profile.reference_object_key);
    const person = await streamToBuffer(personObject, TRYON_REFERENCE_MAX_BYTES);
    const output = await invokeFashn({
      person,
      personContentType: normalizedContentType(profile.content_type),
      garment: garment.bytes,
      garmentContentType: garment.contentType,
      category
    });
    const byteSize = await uploadGeneratedObject(objectKey, output);
    const expiresAt = new Date(Date.now() + TRYON_PREVIEW_TTL_MS);
    const updated = await getProductionPostgresRuntime().nativePool.query<PreviewRow>(`
      UPDATE public.customer_tryon_previews p SET
        content_type=$3,byte_size=$4,status='ready',expires_at=$5,generated_at=now(),
        last_accessed_at=now(),failure_reason=NULL,updated_at=now()
      FROM public.users u,public.canonical_variants cv
      LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE p.user_id=$1::uuid AND p.cache_key=$2
        AND u.id=p.user_id AND cv.id=p.canonical_variant_id
      RETURNING p.public_id,u.id::text AS user_uuid,cv.public_id AS canonical_public_id,cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,p.profile_version,p.garment_category,
        p.garment_fingerprint,p.cache_key,p.object_key,p.content_type,p.byte_size,p.status,
        p.expires_at,p.saved_at,p.generated_at,p.last_accessed_at,p.created_at,p.updated_at
    `, [profile.user_uuid, cacheKey, OUTPUT_CONTENT_TYPE, byteSize, expiresAt]);
    const row = updated.rows[0];
    if (!row) throw new Error("TRYON_PREVIEW_SAVE_FAILED");
    return { status: "ready", preview: rowToPreview(row), cached: false };
  } catch (error) {
    await storage().delete(objectKey).catch(() => undefined);
    await getProductionPostgresRuntime().nativePool.query(
      "UPDATE public.customer_tryon_previews SET status='failed',failure_reason=$3,updated_at=now() WHERE user_id=$1::uuid AND cache_key=$2",
      [profile.user_uuid, cacheKey, (error instanceof Error ? error.message : String(error)).slice(0, 500)]
    ).catch(() => undefined);
    throw error;
  }
}

async function ownedPreviewRow(userPublicId: string, previewId: string): Promise<PreviewRow | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<PreviewRow>(`
    SELECT ${PREVIEW_SELECT}
    FROM public.customer_tryon_previews p
    JOIN public.users u ON u.id=p.user_id
    JOIN public.canonical_variants cv ON cv.id=p.canonical_variant_id
    LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE p.public_id::text=$1 AND (u.public_id=$2 OR u.id::text=$2)
    LIMIT 1
  `, [previewId, userPublicId]);
  return result.rows[0];
}

export async function readCustomerTryOnPreview(userPublicId: string, previewId: string): Promise<Readonly<{ preview: CustomerTryOnPreview; object: StoredObjectRead }> | undefined> {
  const row = await ownedPreviewRow(userPublicId, previewId);
  if (!row || !["ready","saved"].includes(row.status)) return undefined;
  const now = Date.now();
  if (row.status === "ready" && (!row.expires_at || new Date(row.expires_at).getTime() <= now)) {
    await getProductionPostgresRuntime().nativePool.query(
      "UPDATE public.customer_tryon_previews SET status='expired',updated_at=now() WHERE public_id::text=$1 AND status='ready'",
      [previewId]
    );
    return undefined;
  }
  if (row.status === "ready") {
    const expiresAt = new Date(now + TRYON_PREVIEW_TTL_MS);
    await getProductionPostgresRuntime().nativePool.query(
      "UPDATE public.customer_tryon_previews SET expires_at=$2,last_accessed_at=now(),updated_at=now() WHERE public_id::text=$1 AND status='ready'",
      [previewId, expiresAt]
    );
  }
  return { preview: rowToPreview(row), object: await storage().read(row.object_key) };
}

export async function readCustomerTryOnReference(userPublicId: string): Promise<Readonly<{ profile: CustomerTryOnProfile; object: StoredObjectRead }> | undefined> {
  const row = await profileRowForUser(userPublicId);
  if (!row) return undefined;
  return { profile: rowToProfile(row), object: await storage().read(row.reference_object_key) };
}

export async function saveCustomerTryOnPreview(userPublicId: string, previewId: string): Promise<CustomerTryOnPreview> {
  const result = await getProductionPostgresRuntime().nativePool.query<PreviewRow>(`
    UPDATE public.customer_tryon_previews p SET status='saved',saved_at=COALESCE(saved_at,now()),
      expires_at=NULL,last_accessed_at=now(),updated_at=now()
    FROM public.users u,public.canonical_variants cv
    LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE p.public_id::text=$1 AND p.user_id=u.id AND p.canonical_variant_id=cv.id
      AND (u.public_id=$2 OR u.id::text=$2) AND p.status IN ('ready','saved')
      AND (p.status='saved' OR p.expires_at>now())
    RETURNING p.public_id,u.id::text AS user_uuid,cv.public_id AS canonical_public_id,cv.slug,
      COALESCE(el.title,en.title,cv.model,cv.slug) AS title,p.profile_version,p.garment_category,
      p.garment_fingerprint,p.cache_key,p.object_key,p.content_type,p.byte_size,p.status,p.expires_at,
      p.saved_at,p.generated_at,p.last_accessed_at,p.created_at,p.updated_at
  `, [previewId, userPublicId]);
  const row = result.rows[0];
  if (!row) throw new Error("TRYON_PREVIEW_NOT_FOUND");
  return rowToPreview(row);
}

export async function listSavedCustomerTryOnPreviews(userPublicId: string): Promise<readonly CustomerTryOnPreview[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().nativePool.query<PreviewRow>(`
    SELECT ${PREVIEW_SELECT}
    FROM public.customer_tryon_previews p
    JOIN public.users u ON u.id=p.user_id
    JOIN public.canonical_variants cv ON cv.id=p.canonical_variant_id
    LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE (u.public_id=$1 OR u.id::text=$1) AND p.status='saved' AND p.saved_at IS NOT NULL
    ORDER BY p.saved_at DESC,p.created_at DESC
    LIMIT 100
  `, [userPublicId]);
  return result.rows.map(rowToPreview);
}

export async function deleteCustomerTryOnPreview(userPublicId: string, previewId: string): Promise<boolean> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ object_key: string }>(`
    DELETE FROM public.customer_tryon_previews p
    USING public.users u
    WHERE p.public_id::text=$1 AND p.user_id=u.id AND (u.public_id=$2 OR u.id::text=$2)
    RETURNING p.object_key
  `, [previewId, userPublicId]);
  const row = result.rows[0];
  if (!row) return false;
  await storage().delete(row.object_key).catch(() => undefined);
  return true;
}

export async function cleanupExpiredCustomerTryOnMedia(limit = 100): Promise<Readonly<{ previews: number; uploadIntents: number }>> {
  ensureTryOnStorage();
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const runtime = getProductionPostgresRuntime();
  const expired = await runtime.nativePool.query<{ public_id: string; object_key: string }>(`
    UPDATE public.customer_tryon_previews SET status='expired',updated_at=now()
    WHERE id IN (
      SELECT id FROM public.customer_tryon_previews
      WHERE status='ready' AND saved_at IS NULL AND expires_at<=now()
      ORDER BY expires_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING public_id::text AS public_id,object_key
  `, [safeLimit]);
  let removed = 0;
  for (const row of expired.rows) {
    try {
      await storage().delete(row.object_key);
      await runtime.nativePool.query("DELETE FROM public.customer_tryon_previews WHERE public_id::text=$1 AND status='expired'", [row.public_id]);
      removed += 1;
    } catch {
      // Keep the expired row as a retry marker. It is already inaccessible to customers.
    }
  }

  const intents = await runtime.nativePool.query<{ public_id: string; object_key: string }>(`
    UPDATE public.customer_tryon_upload_intents SET status='expired'
    WHERE id IN (
      SELECT id FROM public.customer_tryon_upload_intents
      WHERE status='initiated' AND expires_at<=now()
      ORDER BY expires_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING public_id::text AS public_id,object_key
  `, [safeLimit]);
  let uploadIntents = 0;
  for (const row of intents.rows) {
    await storage().delete(row.object_key).catch(() => undefined);
    uploadIntents += 1;
  }
  return { previews: removed, uploadIntents };
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
