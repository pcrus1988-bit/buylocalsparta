import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { type SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { fetchPublicVendorResource } from "./vendor-product-feed-preview";

type Candidate = Readonly<{
  itemUuid: string;
  feedId: string;
  vendorUuid: string;
  vendorPublicId: string;
  vendorName: string;
  canonicalVariantUuid: string;
  canonicalPublicId: string;
  title: string;
  sourcePayload: Record<string, unknown>;
}>;

type FeedImage = Readonly<{ src: string; sortOrder: number }>;

export type VendorProductFeedMediaSliceResult = Readonly<{
  candidates: number;
  imported: number;
  skipped: number;
  failed: number;
}>;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGES_PER_PRODUCT = 12;
let storageSingleton: S3ObjectStorage | undefined;

function storage(): S3ObjectStorage {
  return storageSingleton ??= new S3ObjectStorage(objectStorageConfigFromEnv(process.env));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function feedImages(candidate: Candidate): readonly FeedImage[] {
  const first = optionalText(candidate.sourcePayload.imageUrl);
  const additional = Array.isArray(candidate.sourcePayload.additionalImageUrls)
    ? candidate.sourcePayload.additionalImageUrls.map(optionalText).filter((value): value is string => Boolean(value))
    : [];
  const seen = new Set<string>();
  const result: FeedImage[] = [];
  for (const src of [first, ...additional].filter((value): value is string => Boolean(value))) {
    let normalized: string;
    try {
      const url = new URL(src);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      normalized = url.toString();
    } catch {
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ src: normalized, sortOrder: result.length });
    if (result.length >= MAX_IMAGES_PER_PRODUCT) break;
  }
  return result;
}

function maxMediaBytes(): number {
  const parsed = Number(process.env.BLS_MEDIA_UPLOAD_MAX_BYTES || process.env.BLS_MEDIA_MAX_BYTES || 25 * 1024 * 1024);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 25 * 1024 * 1024;
}

async function loadCandidates(limit: number): Promise<readonly Candidate[]> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const result = await pool.query<SqlRow>(`
    SELECT
      i.id::text AS item_uuid,
      f.public_id AS feed_id,
      i.vendor_id::text AS vendor_uuid,
      COALESCE(v.public_id,v.id::text) AS vendor_public_id,
      v.trading_name AS vendor_name,
      cv.id::text AS canonical_variant_uuid,
      cv.public_id AS canonical_public_id,
      COALESCE(NULLIF(i.source_payload->>'title',''),pt_el.title,pt_en.title,'Προϊόν') AS title,
      i.source_payload
    FROM public.vendor_product_feed_items i
    JOIN public.vendor_product_feeds f ON f.id=i.feed_id
    JOIN public.vendor_businesses v ON v.id=i.vendor_id
    JOIN public.canonical_variants cv ON cv.id=i.canonical_variant_id
    LEFT JOIN public.product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
    LEFT JOIN public.product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
    WHERE i.state='present'
      AND i.canonical_variant_id IS NOT NULL
      AND (
        NULLIF(i.source_payload->>'imageUrl','') IS NOT NULL
        OR (
          jsonb_typeof(i.source_payload->'additionalImageUrls')='array'
          AND jsonb_array_length(i.source_payload->'additionalImageUrls')>0
        )
      )
      AND (
        SELECT count(*)
        FROM public.product_media pm
        WHERE pm.canonical_variant_id=i.canonical_variant_id
          AND pm.vendor_id=i.vendor_id
          AND pm.kind='image'
          AND pm.original_filename LIKE ('vfeed:' || i.id::text || ':%')
      ) < LEAST(
        $1::integer,
        (CASE WHEN NULLIF(i.source_payload->>'imageUrl','') IS NOT NULL THEN 1 ELSE 0 END)
        + CASE WHEN jsonb_typeof(i.source_payload->'additionalImageUrls')='array'
               THEN jsonb_array_length(i.source_payload->'additionalImageUrls') ELSE 0 END
      )
    ORDER BY i.updated_at DESC,i.id
    LIMIT $2
  `, [MAX_IMAGES_PER_PRODUCT, limit]);

  return result.rows.map((row) => ({
    itemUuid: String(row.item_uuid),
    feedId: String(row.feed_id),
    vendorUuid: String(row.vendor_uuid),
    vendorPublicId: String(row.vendor_public_id),
    vendorName: String(row.vendor_name),
    canonicalVariantUuid: String(row.canonical_variant_uuid),
    canonicalPublicId: String(row.canonical_public_id),
    title: String(row.title),
    sourcePayload: objectValue(row.source_payload)
  }));
}

function safeFilename(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  return clean.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100) || "image.jpg";
}

function basenameFromUrl(value: string): string {
  try {
    const raw = new URL(value).pathname.split("/").pop() || "image.jpg";
    try { return safeFilename(decodeURIComponent(raw)); } catch { return safeFilename(raw); }
  } catch {
    return "image.jpg";
  }
}

function originalFilename(candidate: Candidate, image: FeedImage): string {
  const hash = createHash("sha256").update(image.src).digest("hex").slice(0, 12);
  return `vfeed:${candidate.itemUuid}:${image.sortOrder}:${hash}:${basenameFromUrl(image.src)}`.slice(0, 240);
}

async function existingFilenames(candidate: Candidate): Promise<Set<string>> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const result = await pool.query<SqlRow>(`
    SELECT original_filename
    FROM public.product_media
    WHERE canonical_variant_id=$1::uuid
      AND vendor_id=$2::uuid
      AND kind='image'
      AND original_filename LIKE $3
  `, [candidate.canonicalVariantUuid, candidate.vendorUuid, `vfeed:${candidate.itemUuid}:%`]);
  return new Set(result.rows.map((row) => String(row.original_filename ?? "")).filter(Boolean));
}

async function downloadImage(rawUrl: string): Promise<{ bytes: Uint8Array; contentType: string; sha256: string }> {
  const response = await fetchPublicVendorResource(rawUrl, {
    maxBytes: maxMediaBytes(),
    accept: "image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1",
    userAgent: "KONTAMOU-VendorFeed-Media/1.0 (+https://kontamou.site/)"
  });
  if (!ALLOWED_IMAGE_TYPES.has(response.contentType)) {
    throw new Error(`vendor_feed_image_type_${response.contentType || "unknown"}`);
  }
  if (!response.bytes.byteLength) throw new Error("vendor_feed_image_size_invalid");
  return {
    bytes: response.bytes,
    contentType: response.contentType,
    sha256: createHash("sha256").update(response.bytes).digest("hex")
  };
}

async function persistImage(candidate: Candidate, image: FeedImage, filename: string): Promise<"imported" | "skipped"> {
  const downloaded = await downloadImage(image.src);
  const extension = downloaded.contentType === "image/png" ? "png" : downloaded.contentType === "image/webp" ? "webp" : "jpg";
  const mediaUuid = randomUUID();
  const mediaPublicId = `media_${randomUUID().replaceAll("-", "")}`;
  const objectKey = `private/vendor-feed-media/${candidate.vendorPublicId}/${candidate.canonicalPublicId}/${candidate.itemUuid}/${image.sortOrder}-${mediaPublicId}.${extension}`;
  const signed = await storage().createUploadUrl({ objectKey, contentType: downloaded.contentType, expiresInSeconds: 600 });
  const uploaded = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: Buffer.from(downloaded.bytes) });
  if (!uploaded.ok) throw new Error(`vendor_feed_media_upload_${uploaded.status}`);
  const stored = await storage().head(objectKey);
  if (!stored || stored.byteSize !== downloaded.bytes.byteLength) {
    await storage().delete(objectKey).catch(() => undefined);
    throw new Error("vendor_feed_media_storage_verification_failed");
  }

  const pool = getProductionPostgresRuntime().sqlPool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE bls_platform_runtime");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`vfeed-media:${candidate.itemUuid}:${filename}`]);
    const existing = await client.query(`
      SELECT id
      FROM public.product_media
      WHERE canonical_variant_id=$1::uuid AND vendor_id=$2::uuid
        AND kind='image' AND original_filename=$3
      LIMIT 1
    `, [candidate.canonicalVariantUuid, candidate.vendorUuid, filename]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      await storage().delete(objectKey).catch(() => undefined);
      return "skipped";
    }
    const now = new Date();
    await client.query(`
      INSERT INTO public.product_media(
        id,public_id,canonical_variant_id,vendor_id,kind,object_key,alt_text,
        rights_owner,rights_status,moderation_status,sort_order,original_filename,
        content_type,byte_size,sha256,scan_status,storage_verified_at,next_scan_at,created_at
      ) VALUES(
        $1::uuid,$2,$3::uuid,$4::uuid,'image',$5,$6,
        $7,'approved','approved',$8,$9,
        $10,$11,$12,'pending',$13,$13,$13
      )
    `, [
      mediaUuid,
      mediaPublicId,
      candidate.canonicalVariantUuid,
      candidate.vendorUuid,
      objectKey,
      `${candidate.title} — φωτογραφία ${image.sortOrder + 1}`,
      candidate.vendorName,
      image.sortOrder,
      filename,
      downloaded.contentType,
      downloaded.bytes.byteLength,
      downloaded.sha256,
      now
    ]);
    await client.query("COMMIT");
    return "imported";
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    await storage().delete(objectKey).catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function runVendorProductFeedMediaSlice(maxProducts = 2): Promise<VendorProductFeedMediaSliceResult> {
  if (process.env.BLS_MEDIA_PIPELINE_ENABLED !== "true") {
    return { candidates: 0, imported: 0, skipped: 0, failed: 0 };
  }
  const safeLimit = Math.min(8, Math.max(1, Math.trunc(maxProducts)));
  const candidates = await loadCandidates(safeLimit);
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const existing = await existingFilenames(candidate);
    for (const image of feedImages(candidate)) {
      const filename = originalFilename(candidate, image);
      if (existing.has(filename)) {
        skipped += 1;
        continue;
      }
      try {
        const result = await persistImage(candidate, image, filename);
        if (result === "imported") imported += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        console.error(JSON.stringify({
          level: "error",
          event: "vendor_product_feed.media_import_failed",
          feedId: candidate.feedId,
          canonicalVariantId: candidate.canonicalPublicId,
          itemId: candidate.itemUuid,
          sortOrder: image.sortOrder,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }
  }

  return { candidates: candidates.length, imported, skipped, failed };
}
