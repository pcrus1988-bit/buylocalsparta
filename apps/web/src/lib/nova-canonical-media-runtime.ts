import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

type CandidateRow = SqlRow & {
  source_product_id: string;
  source_product_key: string;
  source_id: string;
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
  sourceId: string;
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
  contentType?: string;
}>;

export type NovaCanonicalMediaSliceResult = Readonly<{
  candidates: number;
  imported: number;
  skipped: number;
  failed: number;
}>;

const MAX_IMAGES_PER_PRODUCT = 50;

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

function contentTypeFromUrl(value: string): string | undefined {
  try {
    const path = new URL(value).pathname.toLowerCase();
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".webp")) return "image/webp";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  } catch {
    return undefined;
  }
  return undefined;
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
      const position = Number.isFinite(numeric) && numeric >= 0 ? numeric : sourceIndex;
      return { src, position, sourceIndex };
    })
    .filter((entry): entry is { src: string; position: number; sourceIndex: number } => Boolean(entry))
    .sort((left, right) => left.position - right.position || left.sourceIndex - right.sourceIndex);

  const seen = new Set<string>();
  const images: SupplierImage[] = [];
  for (const image of parsed) {
    if (seen.has(image.src)) continue;
    seen.add(image.src);
    images.push({ src: image.src, sortOrder: images.length, contentType: contentTypeFromUrl(image.src) });
    if (images.length >= MAX_IMAGES_PER_PRODUCT) break;
  }
  return images;
}

async function loadCandidates(limit: number): Promise<readonly Candidate[]> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 2_000 });
  const result = await uow.withTransaction(
    { actorUserId: "nova-canonical-media", marketId: "sparta", platformAccess: true },
    (tx) => tx.query<CandidateRow>(`
      SELECT DISTINCT ON (cv.id, vo.vendor_id, csp.id)
             csp.id::text AS source_product_id,
             csp.source_product_key,
             cs.id::text AS source_id,
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
          (
            SELECT COUNT(DISTINCT COALESCE(NULLIF(img.value->>'src',''),NULLIF(img.value->>'url',''),NULLIF(img.value->>'image','')))
            FROM jsonb_array_elements(csp.normalized_payload->'images') AS img(value)
            WHERE COALESCE(NULLIF(img.value->>'src',''),NULLIF(img.value->>'url',''),NULLIF(img.value->>'image','')) LIKE 'https://%'
          ) <> (
            SELECT COUNT(*)
            FROM product_media pm
            WHERE pm.canonical_variant_id=cv.id
              AND pm.vendor_id=vo.vendor_id
              AND pm.source_id=cs.id
              AND pm.kind='image'
              AND pm.source_url IS NOT NULL
              AND pm.original_filename LIKE ('nova:' || csp.id::text || ':%')
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(csp.normalized_payload->'images') AS img(value)
            WHERE COALESCE(NULLIF(img.value->>'src',''),NULLIF(img.value->>'url',''),NULLIF(img.value->>'image','')) LIKE 'https://%'
              AND NOT EXISTS (
                SELECT 1
                FROM product_media pm
                WHERE pm.canonical_variant_id=cv.id
                  AND pm.vendor_id=vo.vendor_id
                  AND pm.source_id=cs.id
                  AND pm.kind='image'
                  AND pm.source_url=COALESCE(NULLIF(img.value->>'src',''),NULLIF(img.value->>'url',''),NULLIF(img.value->>'image',''))
              )
          )
        )
      ORDER BY cv.id, vo.vendor_id, csp.id, csp.created_at DESC
      LIMIT $1
    `, [limit]),
    { readOnly: true }
  );

  return result.rows.map((row) => ({
    sourceProductId: String(row.source_product_id),
    sourceProductKey: String(row.source_product_key),
    sourceId: String(row.source_id),
    title: optionalText(row.source_title) ?? "Προϊόν",
    normalizedPayload: objectValue(row.normalized_payload),
    sourceWebsite: String(row.source_website),
    canonicalVariantUuid: String(row.canonical_variant_uuid),
    canonicalPublicId: String(row.canonical_public_id),
    vendorUuid: String(row.vendor_uuid)
  }));
}

function importedFilename(candidate: Candidate, image: SupplierImage): string {
  return `nova:${candidate.sourceProductId}:${image.sortOrder}:${basenameFromUrl(image.src)}`.slice(0, 255);
}

async function syncCandidate(candidate: Candidate): Promise<number> {
  const images = supplierImages(candidate);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 3_000 });

  return uow.withTransaction(
    { actorUserId: "nova-canonical-media", marketId: "sparta", platformAccess: true },
    async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`nova-source-media:${candidate.canonicalVariantUuid}:${candidate.vendorUuid}:${candidate.sourceProductId}`]);
      let synced = 0;
      for (const image of images) {
        await tx.query(`
          INSERT INTO product_media(
            id,public_id,canonical_variant_id,vendor_id,kind,object_key,alt_text,
            rights_owner,rights_status,moderation_status,sort_order,created_at,
            original_filename,content_type,byte_size,sha256,scan_status,
            storage_verified_at,scan_attempts,next_scan_at,last_scan_error,
            quarantined_at,reviewed_at,source_id,source_url
          ) VALUES(
            $1::uuid,$2,$3::uuid,$4::uuid,'image',NULL,$5,
            'BrandsGateway / Nova','approved','approved',$6,now(),
            $7,$8,NULL,NULL,'clean',
            NULL,0,now(),NULL,NULL,now(),$9::uuid,$10
          )
          ON CONFLICT (canonical_variant_id,vendor_id,source_id,source_url)
            WHERE kind='image' AND source_url IS NOT NULL
          DO UPDATE SET
            sort_order=EXCLUDED.sort_order,
            alt_text=EXCLUDED.alt_text,
            original_filename=EXCLUDED.original_filename,
            content_type=EXCLUDED.content_type,
            rights_owner='BrandsGateway / Nova',
            rights_status='approved',
            moderation_status='approved',
            scan_status='clean',
            reviewed_at=now()
        `, [
          randomUUID(),
          `media_${randomUUID().replaceAll("-", "")}`,
          candidate.canonicalVariantUuid,
          candidate.vendorUuid,
          `${candidate.title} — φωτογραφία ${image.sortOrder + 1}`,
          image.sortOrder,
          importedFilename(candidate, image),
          image.contentType ?? null,
          candidate.sourceId,
          image.src
        ]);
        synced += 1;
      }

      await tx.query(`
        DELETE FROM product_media
        WHERE canonical_variant_id=$1::uuid
          AND vendor_id=$2::uuid
          AND source_id=$3::uuid
          AND kind='image'
          AND source_url IS NOT NULL
          AND original_filename LIKE $4
          AND NOT (source_url = ANY($5::text[]))
      `, [
        candidate.canonicalVariantUuid,
        candidate.vendorUuid,
        candidate.sourceId,
        `nova:${candidate.sourceProductId}:%`,
        images.map((image) => image.src)
      ]);

      return synced;
    },
    { isolation: "serializable" }
  );
}

export async function runNovaCanonicalMediaSlice(maxProducts = 4): Promise<NovaCanonicalMediaSliceResult> {
  const safeLimit = Math.min(25, Math.max(1, Math.trunc(maxProducts)));
  const candidates = await loadCandidates(safeLimit);
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const synced = await syncCandidate(candidate);
      if (synced > 0) imported += synced;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        level: "error",
        event: "nova.canonical_media_sync_failed",
        canonicalVariantId: candidate.canonicalPublicId,
        sourceProductKey: candidate.sourceProductKey,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  return { candidates: candidates.length, imported, skipped, failed };
}
