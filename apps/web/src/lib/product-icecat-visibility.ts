import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";

export type ProductIcecatVisibilityStatus =
  | "not_linked"
  | "evidence"
  | "pending"
  | "processing"
  | "ready"
  | "needs_enrichment"
  | "retry"
  | "failed"
  | "skipped";

export type ProductIcecatVisibility = Readonly<{
  contextKind: "offer" | "submission" | "assigned" | "admin_source";
  contextId: string;
  title: string;
  canonicalVariantId?: string;
  hasIcecatEvidence: boolean;
  status: ProductIcecatVisibilityStatus;
  sourceProductId?: string;
  providerProductId?: string;
  qualityStatus?: string;
  greekCompleteness?: number;
  sourceLocale?: string;
  contentOrigin?: string;
  providedFields: readonly string[];
  specificationCount: number;
  imageCount: number;
  qualityMissing: readonly string[];
  updatedAt?: number;
  lastError?: string;
}>;

type VendorVisibilityInput = Readonly<{
  offerIds?: readonly string[];
  submissionIds?: readonly string[];
  assortmentIds?: readonly string[];
}>;

function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
}

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function boundedIds(values: readonly string[] | undefined): string[] {
  if (!values?.length) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 500);
}

export async function vendorProductIcecatVisibility(
  principal: SessionPrincipal,
  input: VendorVisibilityInput
): Promise<readonly ProductIcecatVisibility[]> {
  const vendorId = requiredVendorId(principal);
  if (!postgresVendorRuntimeEnabled()) return [];
  const offerIds = boundedIds(input.offerIds);
  const submissionIds = boundedIds(input.submissionIds);
  const assortmentIds = boundedIds(input.assortmentIds);
  if (!offerIds.length && !submissionIds.length && !assortmentIds.length) return [];

  return unitOfWork().withTransaction({ platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      WITH vendor AS (
        SELECT id
        FROM public.vendor_businesses
        WHERE public_id=$1 OR id::text=$1
        LIMIT 1
      ), contexts AS (
        SELECT 'offer'::text AS context_kind,
               vo.public_id AS context_id,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
               cv.id AS canonical_uuid,
               cv.public_id AS canonical_public_id,
               NULL::uuid AS direct_source_product_id
        FROM public.vendor_offers vo
        JOIN vendor v ON v.id=vo.vendor_id
        JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN public.product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN public.product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE vo.public_id=ANY($2::text[])

        UNION ALL

        SELECT 'submission'::text,
               s.public_id,
               COALESCE(NULLIF(s.source_identity->>'title',''),cv.model,cv.slug,'Untitled'),
               cv.id,
               cv.public_id,
               NULL::uuid
        FROM public.vendor_product_submissions s
        JOIN vendor v ON v.id=s.vendor_id
        LEFT JOIN public.canonical_variants cv ON cv.id=s.canonical_variant_id
        WHERE s.public_id=ANY($3::text[])

        UNION ALL

        SELECT 'assigned'::text,
               vca.public_id,
               sp.title,
               cv.id,
               cv.public_id,
               sp.id
        FROM public.vendor_catalog_assortments vca
        JOIN vendor v ON v.id=vca.vendor_id
        JOIN public.catalog_source_products sp ON sp.id=vca.source_product_id
        LEFT JOIN LATERAL (
          SELECT l.canonical_variant_id
          FROM public.catalog_source_product_links l
          WHERE l.source_product_id=sp.id AND l.link_status='approved'
          ORDER BY l.reviewed_at DESC NULLS LAST,l.created_at DESC,l.id DESC
          LIMIT 1
        ) approved_link ON true
        LEFT JOIN public.canonical_variants cv ON cv.id=COALESCE(vca.canonical_variant_id,approved_link.canonical_variant_id)
        WHERE vca.public_id=ANY($4::text[])
          AND vca.assortment_status NOT IN ('rejected','discontinued')
      ), resolved AS (
        SELECT c.*,
               ice.source_product_id,
               ice.provider_product_id,
               ice.normalized_payload,
               j.status AS job_status,
               j.last_error,
               j.updated_at AS job_updated_at,
               loc.source_locale,
               loc.content_origin,
               loc.greek_completeness,
               loc.quality_status,
               loc.quality_missing,
               loc.description,
               loc.category_label,
               loc.specifications,
               loc.metadata AS localization_metadata,
               loc.updated_at AS localization_updated_at
        FROM contexts c
        LEFT JOIN LATERAL (
          SELECT isp.id AS source_product_id,
                 isp.source_product_key AS provider_product_id,
                 isp.normalized_payload,
                 ss.created_at
          FROM public.catalog_source_products isp
          JOIN public.catalog_sources ics ON ics.id=isp.source_id AND ics.code='open_icecat'
          JOIN public.catalog_source_snapshots ss ON ss.id=isp.snapshot_id
          WHERE (c.direct_source_product_id IS NOT NULL AND isp.id=c.direct_source_product_id)
             OR (c.canonical_uuid IS NOT NULL AND EXISTS (
                  SELECT 1
                  FROM public.catalog_source_product_links il
                  WHERE il.source_product_id=isp.id
                    AND il.canonical_variant_id=c.canonical_uuid
                    AND il.link_status='approved'
                ))
          ORDER BY (isp.id=c.direct_source_product_id) DESC,ss.created_at DESC,isp.id DESC
          LIMIT 1
        ) ice ON true
        LEFT JOIN public.open_icecat_detail_enrichment_jobs j ON j.source_product_id=ice.source_product_id
        LEFT JOIN public.catalog_source_product_localizations loc ON loc.source_product_id=ice.source_product_id AND loc.locale='EL'
      )
      SELECT context_kind,context_id,title,canonical_public_id,
             source_product_id::text,provider_product_id,job_status,last_error,
             source_locale,content_origin,greek_completeness,quality_status,quality_missing,
             description,category_label,specifications,localization_metadata,normalized_payload,
             COALESCE(localization_updated_at,job_updated_at) AS evidence_updated_at
      FROM resolved
      ORDER BY CASE context_kind WHEN 'offer' THEN 1 WHEN 'submission' THEN 2 ELSE 3 END,title,context_id
    `, [vendorId, offerIds, submissionIds, assortmentIds]);

    return result.rows.map((row) => mapVisibility(row, false));
  }, { readOnly: true, statementTimeoutMs: 10_000 });
}

export async function adminProductIcecatVisibility(
  principal: SessionPrincipal,
  sourceProductId: string
): Promise<readonly ProductIcecatVisibility[]> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return [];
  const productId = sourceProductId.trim();
  if (!productId) return [];

  return unitOfWork().withTransaction({ platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      WITH selected AS (
        SELECT sp.id,sp.title,sp.source_id
        FROM public.catalog_source_products sp
        WHERE sp.id=$1::uuid
        LIMIT 1
      ), selected_variants AS (
        SELECT DISTINCT l.canonical_variant_id
        FROM public.catalog_source_product_links l
        JOIN selected s ON s.id=l.source_product_id
        WHERE l.link_status='approved'
      ), candidates AS (
        SELECT sp.id AS source_product_id,
               sp.source_product_key AS provider_product_id,
               sp.title,
               sp.normalized_payload,
               cv.public_id AS canonical_public_id,
               ss.created_at,
               (sp.id=(SELECT id FROM selected)) AS is_direct
        FROM public.catalog_source_products sp
        JOIN public.catalog_sources cs ON cs.id=sp.source_id AND cs.code='open_icecat'
        JOIN public.catalog_source_snapshots ss ON ss.id=sp.snapshot_id
        LEFT JOIN public.catalog_source_product_links il ON il.source_product_id=sp.id AND il.link_status='approved'
        LEFT JOIN public.canonical_variants cv ON cv.id=il.canonical_variant_id
        WHERE sp.id=(SELECT s.id FROM selected s JOIN public.catalog_sources sc ON sc.id=s.source_id WHERE sc.code='open_icecat')
           OR il.canonical_variant_id IN (SELECT canonical_variant_id FROM selected_variants)
      ), chosen AS (
        SELECT DISTINCT ON (source_product_id)
               source_product_id,provider_product_id,title,normalized_payload,canonical_public_id,created_at,is_direct
        FROM candidates
        ORDER BY source_product_id,is_direct DESC,created_at DESC
      )
      SELECT 'admin_source'::text AS context_kind,
             $1::text AS context_id,
             c.title,c.canonical_public_id,c.source_product_id::text,c.provider_product_id,
             j.status AS job_status,j.last_error,
             loc.source_locale,loc.content_origin,loc.greek_completeness,loc.quality_status,loc.quality_missing,
             loc.description,loc.category_label,loc.specifications,loc.metadata AS localization_metadata,c.normalized_payload,
             COALESCE(loc.updated_at,j.updated_at) AS evidence_updated_at
      FROM chosen c
      LEFT JOIN public.open_icecat_detail_enrichment_jobs j ON j.source_product_id=c.source_product_id
      LEFT JOIN public.catalog_source_product_localizations loc ON loc.source_product_id=c.source_product_id AND loc.locale='EL'
      ORDER BY c.is_direct DESC,c.created_at DESC
      LIMIT 5
    `, [productId]);

    return result.rows.map((row) => mapVisibility(row, true));
  }, { readOnly: true, statementTimeoutMs: 10_000 });
}

function mapVisibility(row: SqlRow, includeError: boolean): ProductIcecatVisibility {
  const sourceProductId = optionalText(row.source_product_id);
  const hasIcecatEvidence = Boolean(sourceProductId);
  const jobStatus = optionalText(row.job_status);
  const normalized = jsonObject(row.normalized_payload);
  const localizationMetadata = jsonObject(row.localization_metadata);
  const specifications = jsonArray(row.specifications);
  const images = jsonArray(localizationMetadata.images).length
    ? jsonArray(localizationMetadata.images)
    : jsonArray(normalized.images);
  const providedFields: string[] = [];
  if (hasIcecatEvidence) providedFields.push("title");
  if (optionalText(row.description)) providedFields.push("description");
  if (optionalText(row.category_label)) providedFields.push("category");
  if (specifications.length) providedFields.push("specifications");
  if (images.length) providedFields.push("images");

  return {
    contextKind: contextKind(row.context_kind),
    contextId: text(row.context_id, "context id"),
    title: optionalText(row.title) ?? "Untitled product",
    canonicalVariantId: optionalText(row.canonical_public_id),
    hasIcecatEvidence,
    status: status(jobStatus, hasIcecatEvidence),
    sourceProductId,
    providerProductId: optionalText(row.provider_product_id),
    qualityStatus: optionalText(row.quality_status),
    greekCompleteness: optionalDecimal(row.greek_completeness),
    sourceLocale: optionalText(row.source_locale),
    contentOrigin: optionalText(row.content_origin),
    providedFields,
    specificationCount: specifications.length,
    imageCount: images.length,
    qualityMissing: textArray(row.quality_missing),
    updatedAt: optionalEpoch(row.evidence_updated_at),
    lastError: includeError ? optionalText(row.last_error) : undefined
  };
}

function status(value: string | undefined, hasEvidence: boolean): ProductIcecatVisibilityStatus {
  if (["pending", "processing", "ready", "needs_enrichment", "retry", "failed", "skipped"].includes(value ?? "")) {
    return value as ProductIcecatVisibilityStatus;
  }
  return hasEvidence ? "evidence" : "not_linked";
}

function contextKind(value: unknown): ProductIcecatVisibility["contextKind"] {
  return value === "offer" || value === "submission" || value === "assigned" || value === "admin_source" ? value : "admin_source";
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.length) throw new Error(`Invalid ${field}`);
  return value;
}
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function optionalDecimal(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function optionalEpoch(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}
function textArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
}
function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
  return {};
}
