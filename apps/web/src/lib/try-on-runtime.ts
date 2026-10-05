import { randomInt, randomUUID } from "node:crypto";
import { serverObjectStorageFromEnv, type ServerObjectStorage } from "@buy-local-sparta/object-storage";
import { getCatalogCard } from "./catalog-view";
import { approvedCatalogImageGallery } from "./public-product-media-gallery";
import { getPublicCatalogSourceImageAtIndex } from "./public-catalog-source-gallery";
import { getPublicProductDetail } from "./public-product-detail";
import { publicOrigin } from "./public-origin";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { issueTryOnGarmentProxyToken } from "./try-on-garment-proxy";
import { isTryOnGarmentCandidate } from "./try-on-eligibility";
import { assertCustomerTryOnSaveToken, CUSTOMER_TRY_ON_EPHEMERAL_TTL_MS, issueCustomerTryOnSaveToken } from "./try-on-security";

const FASHN_BASE_URL = "https://api.fashn.ai/v1";
// Keep base64 JSON requests/responses comfortably below Vercel's 4.5 MB Function payload cap.
const MAX_MODEL_IMAGE_BYTES = 2_700_000;
const MAX_SAVED_IMAGE_BYTES = 2_700_000;
const TRY_ON_MODEL = "tryon-v1.6";

type FashnRunResponse = Readonly<{ id?: string; error?: unknown; message?: string }>;
type FashnStatusResponse = Readonly<{
  id?: string;
  status?: "starting" | "in_queue" | "processing" | "completed" | "failed";
  output?: readonly string[];
  error?: unknown;
}>;

type SavedTryOnRow = Readonly<{
  public_id: string;
  product_public_id: string;
  product_title: string;
  product_slug: string;
  prediction_id: string;
  model_name: string;
  content_type: string;
  byte_size: number | string;
  created_at: Date | string;
}>;

export type CustomerSavedTryOn = Readonly<{
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  predictionId: string;
  modelName: string;
  imageUrl: string;
  byteSize: number;
  createdAt: string;
}>;

export type CustomerTryOnGeneration = Readonly<{
  productId: string;
  productTitle: string;
  predictionId: string;
  modelName: typeof TRY_ON_MODEL;
  imageDataUrl: string;
  saveToken: string;
  generatedAt: string;
  expiresAt: string;
}>;

let sharedCustomerTryOnStorage: ServerObjectStorage | undefined;

function storage(): ServerObjectStorage {
  if (sharedCustomerTryOnStorage) return sharedCustomerTryOnStorage;
  try {
    sharedCustomerTryOnStorage = serverObjectStorageFromEnv({
      defaultBucket: process.env.TRY_ON_STORAGE_BUCKET?.trim() || "buy-local-sparta-private"
    });
    return sharedCustomerTryOnStorage;
  } catch {
    throw new Error("TRY_ON_STORAGE_NOT_CONFIGURED");
  }
}

async function readPrivateObject(objectKey: string) {
  return storage().read(objectKey);
}

async function deletePrivateObject(objectKey: string): Promise<void> {
  await storage().delete(objectKey);
}

function fashnApiKey(): string {
  const value = process.env.FASHN_API_KEY?.trim();
  if (!value) throw new Error("TRY_ON_NOT_CONFIGURED");
  return value;
}

function fashnMode(): "performance" | "balanced" | "quality" {
  const value = process.env.FASHN_TRYON_MODE?.trim().toLowerCase();
  return value === "performance" || value === "quality" ? value : "balanced";
}

function safePredictionId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(id)) throw new Error("INVALID_TRY_ON_RESULT");
  return id;
}

function safeStorageSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 160) || "customer";
}

function imageSignatureMatches(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (contentType === "image/webp") return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

function decodeDataImage(value: unknown, maxBytes: number, allowed: ReadonlySet<string>): { dataUrl: string; contentType: string; bytes: Uint8Array } {
  const dataUrl = typeof value === "string" ? value.trim() : "";
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("INVALID_TRY_ON_IMAGE");
  const contentType = `image/${match[1]}`;
  if (!allowed.has(contentType)) throw new Error("INVALID_TRY_ON_IMAGE");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxBytes) throw new Error("TRY_ON_IMAGE_TOO_LARGE");
  const bytes = new Uint8Array(buffer);
  if (!imageSignatureMatches(contentType, bytes)) throw new Error("INVALID_TRY_ON_IMAGE");
  return { dataUrl, contentType, bytes };
}

async function resolveGarment(userPublicId: string, productId: string) {
  const product = await getCatalogCard(productId, `try-on:${userPublicId}`);
  if (!product) throw new Error("TRY_ON_PRODUCT_NOT_FOUND");
  if (!isTryOnGarmentCandidate(product)) throw new Error("TRY_ON_PRODUCT_UNSUPPORTED");

  const [gallery, detail, governedSource] = await Promise.all([
    approvedCatalogImageGallery({ canonicalVariantId: product.id, preferredVendorId: product.vendorId }),
    getPublicProductDetail(product.id),
    getPublicCatalogSourceImageAtIndex(product.id, 0).catch(() => undefined)
  ]);
  const primary = gallery[0];
  const image = primary
    ? `${publicOrigin()}/api/media/${encodeURIComponent(primary.mediaId)}`
    : governedSource?.src
      ?? product.previewImageSrc
      ?? detail?.sourceImageUrls?.[0];
  if (!image) throw new Error("TRY_ON_PRODUCT_IMAGE_REQUIRED");
  if (image.startsWith("data:")) return { product, image };

  const resolved = new URL(image, publicOrigin());
  const origin = new URL(publicOrigin()).origin;
  if (resolved.origin === origin) return { product, image: resolved.toString() };

  const token = await issueTryOnGarmentProxyToken(resolved.toString());
  const proxy = new URL("/api/try-on/garment-proxy", origin);
  proxy.searchParams.set("token", token);
  return { product, image: proxy.toString() };
}

function providerError(value: unknown, message?: unknown): string {
  const record = typeof value === "object" && value ? value as Record<string, unknown> : undefined;
  const name = typeof record?.name === "string" ? record.name : typeof value === "string" ? value : "";
  const detail = typeof record?.message === "string"
    ? record.message
    : typeof message === "string"
      ? message
      : "";
  const haystack = `${name} ${detail}`.toLowerCase();

  if (haystack.includes("poseerror") || haystack.includes("pose")) return "TRY_ON_POSE_REQUIRED";
  if (haystack.includes("contentmoderation") || haystack.includes("moderation")) return "TRY_ON_CONTENT_BLOCKED";
  if (haystack.includes("imageload")) {
    if (haystack.includes("garment") || haystack.includes("product")) return "TRY_ON_PRODUCT_IMAGE_LOAD_FAILED";
    if (haystack.includes("model")) return "TRY_ON_MODEL_IMAGE_LOAD_FAILED";
    return "TRY_ON_INPUT_INVALID";
  }
  if (haystack.includes("inputvalidation") || haystack.includes("badrequest")) return "TRY_ON_INPUT_INVALID";
  if (haystack.includes("outofcredits") || haystack.includes("out of credits")) return "TRY_ON_CREDITS_UNAVAILABLE";
  if (
    haystack.includes("ratelimit")
    || haystack.includes("concurrency")
    || haystack.includes("unavailable")
    || haystack.includes("thirdparty")
    || haystack.includes("pipeline")
    || haystack.includes("internalserver")
  ) return "TRY_ON_PROVIDER_BUSY";
  if (haystack.includes("unauthorized") || haystack.includes("forbidden")) return "TRY_ON_NOT_CONFIGURED";
  return "TRY_ON_PROVIDER_FAILED";
}

function logProviderFailure(input: {
  phase: "run" | "status";
  productId: string;
  predictionId?: string;
  status?: number;
  value: unknown;
  message?: unknown;
}): void {
  const record = typeof input.value === "object" && input.value ? input.value as Record<string, unknown> : undefined;
  const name = typeof record?.name === "string" ? record.name : typeof input.value === "string" ? input.value : "";
  const detail = typeof record?.message === "string"
    ? record.message
    : typeof input.message === "string"
      ? input.message
      : "";
  const safeDetail = detail
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "<base64-image>")
    .slice(0, 500);
  console.warn(JSON.stringify({
    level: "warn",
    event: "try_on.fashn_failed",
    phase: input.phase,
    productId: input.productId,
    predictionId: input.predictionId,
    httpStatus: input.status,
    providerErrorName: name.slice(0, 120),
    providerMessage: safeDetail
  }));
}

function providerHttpError(status: number, value: unknown, message?: unknown): string {
  if (status === 401 || status === 403) return "TRY_ON_NOT_CONFIGURED";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "TRY_ON_PROVIDER_BUSY";
  return providerError(value, message);
}

function retryAfterMs(response: Response): number {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return 2_500;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5_000, Math.max(500, Math.ceil(seconds * 1000)));
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(5_000, Math.max(500, date - Date.now()));
  return 2_500;
}

function wait(ms: number, signal?: AbortSignal) {
  if (!signal) return new Promise<void>((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function generateCustomerTryOn(input: {
  userPublicId: string;
  productId: string;
  modelImageDataUrl: unknown;
  signal?: AbortSignal;
  beforeProviderRun?: () => Promise<void>;
  onProviderFailure?: () => Promise<void>;
}): Promise<CustomerTryOnGeneration> {
  const model = decodeDataImage(input.modelImageDataUrl, MAX_MODEL_IMAGE_BYTES, new Set(["image/jpeg", "image/png", "image/webp"]));
  const { product, image: garmentImage } = await resolveGarment(input.userPublicId, input.productId.trim());
  const apiKey = fashnApiKey();

  // Reserve quota only after local image/product validation has passed and immediately
  // before the paid provider call. This keeps the 50/month allowance aligned to cost exposure.
  await input.beforeProviderRun?.();

  const runResponse = await fetch(`${FASHN_BASE_URL}/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model_name: TRY_ON_MODEL,
      inputs: {
        model_image: model.dataUrl,
        garment_image: garmentImage,
        category: "auto",
        garment_photo_type: "auto",
        mode: fashnMode(),
        moderation_level: "permissive",
        num_samples: 1,
        seed: randomInt(0, 2 ** 32 - 1),
        output_format: "jpeg",
        return_base64: true
      }
    }),
    cache: "no-store",
    signal: input.signal
  });
  const started = await runResponse.json().catch(() => ({})) as FashnRunResponse;
  if (!runResponse.ok || !started.id) {
    logProviderFailure({
      phase: "run",
      productId: product.id,
      status: runResponse.status,
      value: started.error,
      message: started.message
    });
    await input.onProviderFailure?.();
    throw new Error(providerHttpError(runResponse.status, started.error, started.message));
  }

  const predictionId = safePredictionId(started.id);
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    await wait(2_000, input.signal);
    const statusResponse = await fetch(`${FASHN_BASE_URL}/status/${encodeURIComponent(predictionId)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: input.signal
    });
    const status = await statusResponse.json().catch(() => ({})) as FashnStatusResponse;
    if (statusResponse.status === 429) {
      await wait(retryAfterMs(statusResponse), input.signal);
      continue;
    }
    if (!statusResponse.ok) {
      logProviderFailure({
        phase: "status",
        productId: product.id,
        predictionId,
        status: statusResponse.status,
        value: status.error
      });
      throw new Error(providerHttpError(statusResponse.status, status.error));
    }
    if (status.status === "failed") {
      logProviderFailure({
        phase: "status",
        productId: product.id,
        predictionId,
        status: statusResponse.status,
        value: status.error
      });
      await input.onProviderFailure?.();
      throw new Error(providerError(status.error));
    }
    if (status.status !== "completed") continue;
    const output = status.output?.[0];
    const result = decodeDataImage(output, MAX_SAVED_IMAGE_BYTES, new Set(["image/jpeg", "image/png"]));
    const generatedAt = Date.now();
    const expiresAt = generatedAt + CUSTOMER_TRY_ON_EPHEMERAL_TTL_MS;
    return {
      productId: product.id,
      productTitle: product.title,
      predictionId,
      modelName: TRY_ON_MODEL,
      imageDataUrl: result.dataUrl,
      saveToken: issueCustomerTryOnSaveToken({
        userPublicId: input.userPublicId,
        productId: product.id,
        predictionId,
        imageBytes: result.bytes,
        now: generatedAt
      }),
      generatedAt: new Date(generatedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString()
    };
  }
  throw new Error("TRY_ON_TIMEOUT");
}

function rowToSavedTryOn(row: SavedTryOnRow): CustomerSavedTryOn {
  return {
    id: String(row.public_id),
    productId: row.product_public_id,
    productTitle: row.product_title,
    productSlug: row.product_slug,
    predictionId: row.prediction_id,
    modelName: row.model_name,
    imageUrl: `/api/account/try-on/saved/${encodeURIComponent(String(row.public_id))}/image`,
    byteSize: Number(row.byte_size) || 0,
    createdAt: new Date(row.created_at).toISOString()
  };
}

async function uploadPrivateObject(objectKey: string, contentType: string, bytes: Uint8Array): Promise<void> {
  await storage().put({ objectKey, contentType, body: bytes });
  const metadata = await storage().head(objectKey);
  if (!metadata || metadata.byteSize !== bytes.byteLength) {
    await storage().delete(objectKey).catch(() => undefined);
    throw new Error("TRY_ON_STORAGE_VERIFY_FAILED");
  }
}

async function existingSavedTryOn(userPublicId: string, predictionId: string, productId: string): Promise<CustomerSavedTryOn | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<SavedTryOnRow>(`
    SELECT
      t.public_id,cv.public_id AS product_public_id,t.product_title,t.product_slug,
      t.prediction_id,t.model_name,t.content_type,t.byte_size,t.created_at
    FROM public.customer_try_on_saves t
    JOIN public.users u ON u.id=t.user_id
    JOIN public.canonical_variants cv ON cv.id=t.canonical_variant_id
    WHERE (u.public_id=$1 OR u.id::text=$1)
      AND t.provider='fashn'
      AND t.prediction_id=$2
      AND cv.public_id=$3
    LIMIT 1
  `, [userPublicId, predictionId, productId]);
  return result.rows[0] ? rowToSavedTryOn(result.rows[0]) : undefined;
}

export async function saveCustomerTryOn(input: {
  userPublicId: string;
  productId: string;
  predictionId: unknown;
  imageDataUrl: unknown;
  saveToken: unknown;
  outfitName?: unknown;
}): Promise<CustomerSavedTryOn> {
  if (!productionDatabaseConfigured()) throw new Error("TRY_ON_STORAGE_NOT_CONFIGURED");
  const predictionId = safePredictionId(input.predictionId);
  const productId = input.productId.trim();
  const image = decodeDataImage(input.imageDataUrl, MAX_SAVED_IMAGE_BYTES, new Set(["image/jpeg", "image/png"]));
  assertCustomerTryOnSaveToken({
    token: input.saveToken,
    userPublicId: input.userPublicId,
    productId,
    predictionId,
    imageBytes: image.bytes
  });
  const existing = await existingSavedTryOn(input.userPublicId, predictionId, productId);
  if (existing) return existing;
  const { product } = await resolveGarment(input.userPublicId, productId);
  const requestedOutfitName = typeof input.outfitName === "string" ? input.outfitName.trim().replace(/\s+/g, " ").slice(0, 180) : "";
  const savedTitle = requestedOutfitName ? `Fitting Room · ${requestedOutfitName}`.slice(0, 240) : product.title.slice(0, 240);
  const publicId = randomUUID();
  const extension = image.contentType === "image/png" ? "png" : "jpg";
  const objectKey = `private/customer-try-on/${safeStorageSegment(input.userPublicId)}/${publicId}.${extension}`;

  await uploadPrivateObject(objectKey, image.contentType, image.bytes);
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<SavedTryOnRow>(`
      INSERT INTO public.customer_try_on_saves(
        public_id,user_id,canonical_variant_id,product_title,product_slug,
        provider,model_name,prediction_id,object_key,content_type,byte_size
      )
      SELECT $3::uuid,u.id,cv.id,$4,$5,'fashn',$6,$7,$8,$9,$10
      FROM public.users u
      JOIN public.canonical_variants cv ON cv.public_id=$2
      WHERE (u.public_id=$1 OR u.id::text=$1)
      ORDER BY (u.public_id=$1) DESC
      LIMIT 1
      RETURNING
        public_id,
        (SELECT public_id FROM public.canonical_variants WHERE id=canonical_variant_id) AS product_public_id,
        product_title,product_slug,prediction_id,model_name,content_type,byte_size,created_at
    `, [
      input.userPublicId,
      product.id,
      publicId,
      savedTitle,
      product.slug.slice(0, 180),
      TRY_ON_MODEL,
      predictionId,
      objectKey,
      image.contentType,
      image.bytes.byteLength
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("TRY_ON_ACCOUNT_OR_PRODUCT_NOT_FOUND");
    return rowToSavedTryOn(row);
  } catch (error) {
    await deletePrivateObject(objectKey).catch(() => undefined);
    throw error;
  }
}

export async function listCustomerSavedTryOns(userPublicId: string): Promise<readonly CustomerSavedTryOn[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().nativePool.query<SavedTryOnRow>(`
    SELECT
      t.public_id,cv.public_id AS product_public_id,t.product_title,t.product_slug,
      t.prediction_id,t.model_name,t.content_type,t.byte_size,t.created_at
    FROM public.customer_try_on_saves t
    JOIN public.users u ON u.id=t.user_id
    JOIN public.canonical_variants cv ON cv.id=t.canonical_variant_id
    WHERE u.public_id=$1 OR u.id::text=$1
    ORDER BY t.created_at DESC
    LIMIT 100
  `, [userPublicId]);
  return result.rows.map(rowToSavedTryOn);
}

async function ownedSavedObject(userPublicId: string, savedId: string): Promise<{ objectKey: string; contentType: string } | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().nativePool.query<{ object_key: string; content_type: string }>(`
    SELECT t.object_key,t.content_type
    FROM public.customer_try_on_saves t
    JOIN public.users u ON u.id=t.user_id
    WHERE t.public_id::text=$1
      AND (u.public_id=$2 OR u.id::text=$2)
    LIMIT 1
  `, [savedId, userPublicId]);
  const row = result.rows[0];
  return row ? { objectKey: row.object_key, contentType: row.content_type } : undefined;
}

export async function readCustomerSavedTryOnImage(userPublicId: string, savedId: string) {
  const owned = await ownedSavedObject(userPublicId, savedId);
  if (!owned) return undefined;
  const object = await readPrivateObject(owned.objectKey);
  return { ...object, contentType: owned.contentType || object.contentType || "image/jpeg" };
}

export async function deleteCustomerSavedTryOn(userPublicId: string, savedId: string): Promise<boolean> {
  const owned = await ownedSavedObject(userPublicId, savedId);
  if (!owned) return false;
  await deletePrivateObject(owned.objectKey);
  const result = await getProductionPostgresRuntime().nativePool.query(`
    DELETE FROM public.customer_try_on_saves t
    USING public.users u
    WHERE t.user_id=u.id
      AND t.public_id::text=$1
      AND (u.public_id=$2 OR u.id::text=$2)
  `, [savedId, userPublicId]);
  return (result.rowCount ?? 0) > 0;
}

export async function purgeCustomerTryOnAssets(userPublicId: string): Promise<number> {
  if (!productionDatabaseConfigured()) return 0;
  const result = await getProductionPostgresRuntime().nativePool.query<{ object_key: string }>(`
    SELECT t.object_key
    FROM public.customer_try_on_saves t
    JOIN public.users u ON u.id=t.user_id
    WHERE u.public_id=$1 OR u.id::text=$1
  `, [userPublicId]);
  for (const row of result.rows) await deletePrivateObject(row.object_key);
  const removed = await getProductionPostgresRuntime().nativePool.query(`
    DELETE FROM public.customer_try_on_saves t
    USING public.users u
    WHERE t.user_id=u.id AND (u.public_id=$1 OR u.id::text=$1)
  `, [userPublicId]);
  return removed.rowCount ?? 0;
}
