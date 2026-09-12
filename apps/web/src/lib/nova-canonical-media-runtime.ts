import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { S3ObjectStorage, objectStorageConfigFromEnv } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime } from "./postgres-runtime";

type CandidateRow = SqlRow & {
  source_product_id: string;
  source_product_key: string;
  source_title: string | null;
  normalized_payload: unknown;
  source_website: string;
  canonical_variant_uuid: string;
  canonical_public_id: string;
  vendor_uuid: string;
};

type Candidate = Readonly<{
  sourceProductId: string;
  sourceProductKey: string;
  title: string;
  normalizedPayload: Record<string, unknown>;
  sourceWebsite: string;
  canonicalVariantUuid: string;
  canonicalPublicId: string;
  vendorUuid: string;
}>;

type SupplierImage = Readonly<{
  src: string;
  sortOrder: number;
}>;

export type NovaCanonicalMediaSliceResult = Readonly<{
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

function safeFilename(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  return clean.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 120) || "image.jpg";
}

function basenameFromUrl(value: string): string {
  try {
    const raw = new URL(value).pathname.split("/").pop() || "image.jpg";
    try { return safeFilename(decodeURIComponent(raw)); } catch { return safeFilename(raw); }
  } catch {
    return "image.jpg";
  }
}

function sameSourceHttpsUrl(sourceWebsite: string, candidate: unknown): string | undefined {
  const value = optionalText(candidate);
  if (!value) return undefined;
  try {
    const source = new URL(sourceWebsite);
    const asset = new URL(value, source);
    if (asset.protocol !== "https:") return undefined;
    const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
    if (normalizeHost(source.hostname) !== normalizeHost(asset.hostname)) return undefined;
    return asset.toString();
  } catch {
    return undefined;
  }
}

function supplierImages(candidate: Candidate): readonly SupplierImage[] {
  const rawImages = Array.isArray(candidate.normalizedPayload.images) ? candidate.normalizedPayload.images : [];
  const parsed = rawImages
    .map((entry, sourceIndex) => {
      const image = objectValue(entry);
      const src = sameSourceHttpsUrl(candidate.sourceWebsite, image.src ?? image.url ?? image.image);
      if (!src) return undefined;
      const numeric = Number(image.position);
      const position = Number.isFinite(numeric) && numeric >= 0 ? numeric : sourceIndex + 1;
      return { src, position, sourceIndex };
    })
    .filter((entry): entry is { src: string; position: number; sourceIndex: number } => Boolean(entry))
    .sort((left, right) => left.position - right.position || left.sourceIndex - right.sourceIndex);

  const seen = new Set<string>();
  const images: SupplierImage[] = [];
  for (const image of parsed) {
    if (seen.has(image.src)) continue;
    seen.add(image.src);
    images.push({ src: image.src, sortOrder: images.length });
    if (images.length >= MAX_IMAGES_PER_PRODUCT) break;
  }
  return images;
}

function maxMediaBytes(): number {
  const parsed = Number(process.env.BLS_MEDIA_UPLOAD_MAX_BYTES || process.env.BLS_MEDIA_MAX_BYTES || 25 * 1024 * 1024);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 25 * 1024 * 1024;
}

async function loadCandidates(limit: number): Promise<readonly Candidate[]> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction(
    { actorUserId: "nova-canonical-media", marketId: "sparta", platformAccess: true },
    (tx) => tx.query<CandidateRow>(`
      SELECT DISTINCT ON (cv.id, vo.vendor_id)
             csp.id::text AS source_product_id,
             csp.source_product_key,
             csp.title AS source_title,
             csp.normalized_payload,
             cs.website AS source_website,
             cv.id::text AS canonical_variant_uuid,
             cv.public_id AS canonical_public_id,
             vo.vendor_id::text AS vendor_uuid
      FROM catalog_source_products csp
      JOIN catalog_sources cs ON cs.id=csp.source_id
      JOIN dropship_supplier_offers dso ON dso.source_product_id=csp.id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      WHERE cs.code='nova-brandsgateway'
        AND cs.active=true
        AND m.code='sparta'
        AND cv.active=true
        AND jsonb_typeof(csp.normalized_payload->'images')='array'
        AND jsonb_array_length(csp.normalized_payload->'images') > 0
        AND (
          SELECT COUNT(*)
          FROM product_media pm
          WHERE pm.canonical_variant_id=cv.id
            AND pm.vendor_id=vo.vendor_id
            AND pm.kind='image'
            AND pm.original_filename LIKE ('nova:' || csp.id::text || ':%')
        ) < LEAST(jsonb_array_length(csp.normalized_payload->'images'), $1::integer)
      ORDER BY cv.id, vo.vendor_id, csp.created_at DESC
      LIMIT $2
    `, [MAX_IMAGES_PER_PRODUCT, limit]),
    { readOnly: true }
  );

  return result.rows.map((row) => ({
    sourceProductId: String(row.source_product_id),
    sourceProductKey: String(row.source_product_key),
    title: optionalText(row.source_title) ?? "Προϊόν",
    normalizedPayload: objectValue(row.normalized_payload),
    sourceWebsite: String(row.source_website),
    canonicalVariantUuid: String(row.canonical_variant_uuid),
    canonicalPublicId: String(row.canonical_public_id),
    vendorUuid: String(row.vendor_uuid)
  }));
}

async function existingOriginalFilenames(candidate: Candidate): Promise<Set<string>> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction(
    { actorUserId: "nova-canonical-media", marketId: "sparta", platformAccess: true },
    (tx) => tx.query<SqlRow>(`
      SELECT original_filename
      FROM product_media
      WHERE canonical_variant_id=$1::uuid
        AND vendor_id=$2::uuid
        AND kind='image'
        AND original_filename LIKE $3
    `, [candidate.canonicalVariantUuid, candidate.vendorUuid, `nova:${candidate.sourceProductId}:%`]),
    { readOnly: true }
  );
  return new Set(result.rows.map((row) => String(row.original_filename ?? "")).filter(Boolean));
}

function importedFilename(candidate: Candidate, image: SupplierImage): string {
  const urlHash = createHash("sha256").update(image.src).digest("hex").slice(0, 12);
  return `nova:${candidate.sourceProductId}:${image.sortOrder}:${urlHash}:${basenameFromUrl(image.src)}`.slice(0, 240);
}

async function downloadImage(src: string): Promise<{ bytes: Uint8Array; contentType: string; sha256: string }> {
  const response = await fetch(src, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "KONTA-MOY-NOVA-Media/1.0" }
  });
  if (!response.ok) throw new Error(`supplier_image_http_${response.status}`);
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new Error(`unsupported_supplier_image_type:${contentType || "unknown"}`);
  const declaredLength = Number(response.headers.get("content-length"));
  const maxBytes = maxMediaBytes();
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("supplier_image_too_large");
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (!buffer.byteLength || buffer.byteLength > maxBytes) throw new Error("supplier_image_size_invalid");
  return { bytes: buffer, contentType, sha256: createHash("sha256").update(buffer).digest("hex") };
}

async function persistImage(candidate: Candidate, image: SupplierImage, originalFilename: string): Promise<"imported" | "skipped"> {
  const downloaded = await downloadImage(image.src);
  const mediaUuid = randomUUID();
  const mediaPublicId = `media_${randomUUID().replaceAll("-", "")}`;
  const extension = downloaded.contentType === "image/png" ? "png" : downloaded.contentType === "image/webp" ? "webp" : "jpg";
  const objectKey = `private/nova-catalogue/${candidate.canonicalPublicId}/${candidate.sourceProductId}/${image.sortOrder}-${mediaPublicId}.${extension}`;
  const signed = await storage().createUploadUrl({ objectKey, contentType: downloaded.contentType, expiresInSeconds: 600 });
  const upload = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: downloaded.bytes });
  if (!upload.ok) throw new Error(`object_storage_upload_${upload.status}`);
  const stored = await storage().head(objectKey);
  if (!stored || stored.byteSize !== downloaded.bytes.byteLength) {
    await storage().delete(objectKey).catch(() => undefined);
    throw new Error("object_storage_verification_failed");
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 3_000 });
  const inserted = await uow.withTransaction(
    { actorUserId: "nova-canonical-media", marketId: "sparta", platformAccess: true },
    async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`nova-media:${candidate.canonicalVariantUuid}:${candidate.vendorUuid}:${originalFilename}`]);
      const existing = await tx.query<SqlRow>(`
        SELECT id::text AS id
        FROM product_media
        WHERE canonical_variant_id=$1::uuid
          AND vendor_id=$2::uuid
          AND kind='image'
          AND original_filename=$3
        LIMIT 1
      `, [candidate.canonicalVariantUuid, candidate.vendorUuid, originalFilename]);
      if (existing.rowCount) return false;
      const now = new Date();
      await tx.query(`
        INSERT INTO product_media(
          id,public_id,canonical_variant_id,vendor_id,kind,object_key,alt_text,
          rights_owner,rights_status,moderation_status,sort_order,original_filename,
          content_type,byte_size,sha256,scan_status,storage_verified_at,next_scan_at,
          rights_verified_at,moderation_reviewed_at,reviewed_at,created_at
        ) VALUES(
          $1::uuid,$2,$3::uuid,$4::uuid,'image',$5,$6,
          'BrandsGateway / Nova','approved','approved',$7,$8,
          $9,$10,$11,'pending',$12,$12,$12,$12,$12,$12
        )
      `, [
        mediaUuid,
        mediaPublicId,
        candidate.canonicalVariantUuid,
        candidate.vendorUuid,
        objectKey,
        `${candidate.title} — φωτογραφία ${image.sortOrder + 1}`,
        image.sortOrder,
        originalFilename,
        downloaded.contentType,
        downloaded.bytes.byteLength,
        downloaded.sha256,
        now
      ]);
      return true;
    },
    { isolation: "serializable" }
  );

  if (!inserted) {
    await storage().delete(objectKey).catch(() => undefined);
    return "skipped";
  }
  return "imported";
}

export async function runNovaCanonicalMediaSlice(maxProducts = 4): Promise<NovaCanonicalMediaSliceResult> {
  const safeLimit = Math.min(12, Math.max(1, Math.trunc(maxProducts)));
  if (process.env.BLS_MEDIA_PIPELINE_ENABLED !== "true") throw new Error("media_pipeline_disabled");
  const candidates = await loadCandidates(safeLimit);
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const existing = await existingOriginalFilenames(candidate);
    for (const image of supplierImages(candidate)) {
      const filename = importedFilename(candidate, image);
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
          event: "nova.canonical_media_import_failed",
          canonicalVariantId: candidate.canonicalPublicId,
          sourceProductKey: candidate.sourceProductKey,
          sortOrder: image.sortOrder,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }
  }

  return { candidates: candidates.length, imported, skipped, failed };
}
