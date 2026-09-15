import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const SUPPLIER_CODE = "nova_brandsgateway";
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;
const RIGHTS_OWNER = "BrandsGateway / Nova";

export type NovaMediaMaterializationResult = Readonly<{
  enabled: boolean;
  scanned: number;
  inserted: number;
  message?: string;
}>;

/**
 * Materialize the supplier gallery as canonical remote media.
 *
 * Supplier payload remains the source of truth. We deliberately keep source_url
 * instead of copying supplier assets into KONTA MOY storage, and preserve the
 * established BrandsGateway/NOVA provenance used by existing catalogue media.
 * The operation is idempotent by canonical variant + source + source URL.
 *
 * Product-level gallery images are shared by every canonical variant linked to
 * the same source product. Supplier ordering is retained, with position 0 as
 * the canonical primary image. Broken/empty/non-HTTPS URLs are ignored.
 */
export async function runNovaMediaMaterializationSlice(): Promise<NovaMediaMaterializationResult> {
  if (process.env.BLS_NOVA_MEDIA_MATERIALIZATION_ENABLED === "false") {
    return { enabled: false,scanned: 0,inserted: 0,message: "media_materialization_disabled" };
  }

  const pool = getProductionPostgresRuntime().sqlPool;
  const candidates = await pool.query<SqlRow>(`
    SELECT DISTINCT
      cv.id AS canonical_variant_id,
      csp.source_id,
      csp.title,
      csp.normalized_payload->'images' AS images
    FROM public.dropship_suppliers ds
    JOIN public.catalog_source_products csp ON csp.source_id=ds.catalog_source_id
    JOIN public.catalog_source_product_links cspl
      ON cspl.source_product_id=csp.id
     AND cspl.link_status='approved'
    JOIN public.canonical_variants cv ON cv.id=cspl.canonical_variant_id
    WHERE ds.code=$1
      AND ds.active=true
      AND jsonb_typeof(csp.normalized_payload->'images')='array'
      AND jsonb_array_length(csp.normalized_payload->'images')>0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(csp.normalized_payload->'images') image
        WHERE image->>'src' LIKE 'https://%'
          AND NOT EXISTS (
            SELECT 1 FROM public.product_media pm
            WHERE pm.canonical_variant_id=cv.id
              AND pm.source_id=csp.source_id
              AND pm.kind='image'
              AND pm.source_url=image->>'src'
          )
      )
    ORDER BY cv.id
    LIMIT $2
  `,[SUPPLIER_CODE,batchSize()]);

  let inserted = 0;
  for (const candidate of candidates.rows) {
    const canonicalVariantId = requiredText(candidate.canonical_variant_id,"canonical variant id");
    const sourceId = requiredText(candidate.source_id,"source id");
    const title = optionalText(candidate.title);
    const images = Array.isArray(candidate.images) ? candidate.images : [];

    for (let fallbackPosition=0; fallbackPosition<images.length; fallbackPosition += 1) {
      const raw = images[fallbackPosition];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const image = raw as Record<string,unknown>;
      const sourceUrl = optionalText(image.src);
      if (!sourceUrl || !sourceUrl.startsWith("https://")) continue;
      const suppliedPosition = integerPosition(image.position);
      const sortOrder = suppliedPosition ?? fallbackPosition;
      const altText = optionalText(image.alt) ?? title;

      const result = await pool.query<SqlRow>(`
        INSERT INTO public.product_media(
          canonical_variant_id,vendor_id,kind,object_key,alt_text,
          rights_owner,rights_status,moderation_status,sort_order,
          scan_status,source_id,source_url,storage_verified_at
        )
        SELECT
          $1::uuid,NULL,'image',NULL,$2,
          $3,'approved','approved',$4,
          'clean',$5::uuid,$6,NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM public.product_media pm
          WHERE pm.canonical_variant_id=$1::uuid
            AND pm.source_id=$5::uuid
            AND pm.kind='image'
            AND pm.source_url=$6
        )
        RETURNING id
      `,[canonicalVariantId,altText,RIGHTS_OWNER,sortOrder,sourceId,sourceUrl]);
      inserted += result.rowCount ?? result.rows.length;
    }
  }

  return {
    enabled: true,
    scanned: candidates.rowCount ?? candidates.rows.length,
    inserted,
    message: candidates.rows.length === 0 ? "media_materialization_caught_up" : "media_materialization_progress"
  };
}

function batchSize(): number {
  const raw = Number(process.env.BLS_NOVA_MEDIA_MATERIALIZATION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  return Number.isSafeInteger(raw) && raw > 0 ? Math.min(MAX_BATCH_SIZE,raw) : DEFAULT_BATCH_SIZE;
}

function integerPosition(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function requiredText(value: unknown,label: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
