import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VitexBulkAssignmentResult = Readonly<{
  vendorId: string;
  locationId?: string;
  totalProducts: number;
  inserted: number;
  reactivated: number;
  archived: number;
}>;

export type VitexPublicContentInput = Readonly<{
  canonicalId: string;
  title: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  imageUrl?: string;
  reason: string;
}>;

export type VitexPublicContentResult = Readonly<{
  canonicalId: string;
  slug: string;
  title: string;
}>;

const asText = (value: unknown) => typeof value === "string" ? value : String(value ?? "");
const asInt = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function auditReason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.length > 500) {
    throw new Error("Audit reason must be between 3 and 500 characters");
  }
  return normalized;
}

function boundedText(value: string | undefined, maxLength: number): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error(`Text must be at most ${maxLength} characters`);
  return normalized;
}

function publicImageUrl(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Product image must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "media.adeo.com") {
    throw new Error("VITEX commerce images must use the approved media host");
  }
  return url.toString();
}

function database() {
  if (!productionDatabaseConfigured()) throw new Error("Production database is required for VITEX catalogue administration");
  return getProductionPostgresRuntime().sqlPool;
}

export async function adminAssignAllVitexProducts(
  principal: SessionPrincipal,
  input: Readonly<{ vendorId: string; locationId: string; reason: string }>
): Promise<VitexBulkAssignmentResult> {
  assertAdminPermission(principal, "catalog.write");
  assertAdminPermission(principal, "vendor.manage");
  const vendorId = input.vendorId.trim();
  const locationId = input.locationId.trim();
  const reason = auditReason(input.reason);
  if (!vendorId || !locationId) throw new Error("Vendor and location are required");

  const db = database();
  const context = await db.query<SqlRow>(`
    SELECT v.id::text AS vendor_uuid,v.public_id AS vendor_public_id,v.market_id::text AS market_uuid,
           l.id::text AS location_uuid,l.public_id AS location_public_id
    FROM vendor_businesses v
    JOIN vendor_locations l ON l.vendor_id=v.id
    WHERE (v.public_id=$1 OR v.id::text=$1)
      AND (l.public_id=$2 OR l.id::text=$2)
      AND l.active=true
    LIMIT 1
  `, [vendorId, locationId]);
  const row = context.rows[0];
  if (!row) throw new Error("Vendor/active-location combination is invalid");

  const result = await db.query<SqlRow>(`
    WITH target AS (
      SELECT cv.id AS canonical_variant_id,
             cv.public_id AS canonical_public_id,
             cv.platform_price_minor AS price_minor,
             cv.tax_rate_bps
      FROM canonical_variants cv
      JOIN brands b ON b.id=cv.brand_id
      WHERE b.normalized_name='vitex'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND cv.market_id=$1::uuid
        AND cv.platform_price_minor>0
    ),
    existing AS (
      SELECT vo.id,vo.status AS old_status
      FROM vendor_offers vo
      JOIN target t ON t.canonical_variant_id=vo.canonical_variant_id
      WHERE vo.vendor_id=$2::uuid
        AND vo.location_id=$3::uuid
    ),
    touched AS (
      UPDATE vendor_offers vo
      SET status='approved'::offer_status,
          approved_at=COALESCE(vo.approved_at,now()),
          merchant_visible=true,
          merchant_pause_active=false,
          source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
            || jsonb_build_object(
              'adminAssigned',true,
              'adminAssignedAt',now(),
              'catalogue','vitex',
              'bulkAssignment',true
            ),
          updated_at=now()
      FROM existing
      WHERE vo.id=existing.id
      RETURNING vo.id,existing.old_status::text
    ),
    inserted AS (
      INSERT INTO vendor_offers(
        id,public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,
        supplier_unit_price_minor,customer_price_minor,currency,supplier_tax_rate_bps,
        source_payload,created_at,updated_at
      )
      SELECT
        gen_random_uuid(),
        'offer_'||replace(gen_random_uuid()::text,'-',''),
        $1::uuid,
        $2::uuid,
        $3::uuid,
        t.canonical_variant_id,
        'VITEX-'||upper(substr(replace(t.canonical_public_id,'cv_vitex_',''),1,16)),
        'approved',
        t.price_minor,
        t.price_minor,
        'EUR',
        t.tax_rate_bps,
        jsonb_build_object(
          'adminAssigned',true,
          'adminAssignedAt',now(),
          'catalogue','vitex',
          'bulkAssignment',true,
          'canonicalVariantId',t.canonical_public_id
        ),
        now(),
        now()
      FROM target t
      WHERE NOT EXISTS (
        SELECT 1
        FROM vendor_offers existing_offer
        WHERE existing_offer.vendor_id=$2::uuid
          AND existing_offer.location_id=$3::uuid
          AND existing_offer.canonical_variant_id=t.canonical_variant_id
      )
      RETURNING id
    )
    SELECT
      (SELECT count(*) FROM target)::int AS total_products,
      (SELECT count(*) FROM inserted)::int AS inserted,
      (SELECT count(*) FROM touched WHERE old_status <> 'approved')::int AS reactivated
  `, [asText(row.market_uuid), asText(row.vendor_uuid), asText(row.location_uuid)]);
  const stats = result.rows[0] ?? {};
  if (asInt(stats.total_products) === 0) {
    throw new Error("No active canonical VITEX products are available for assignment");
  }

  const response: VitexBulkAssignmentResult = {
    vendorId: asText(row.vendor_public_id),
    locationId: asText(row.location_public_id),
    totalProducts: asInt(stats.total_products),
    inserted: asInt(stats.inserted),
    reactivated: asInt(stats.reactivated),
    archived: 0
  };
  await recordAdminAudit(
    principal,
    "catalog.vendor_vitex.bulk_assigned",
    "vendor",
    response.vendorId,
    reason,
    response
  );
  return response;
}

export async function adminUnassignAllVitexProducts(
  principal: SessionPrincipal,
  input: Readonly<{ vendorId: string; reason: string }>
): Promise<VitexBulkAssignmentResult> {
  assertAdminPermission(principal, "catalog.write");
  assertAdminPermission(principal, "vendor.manage");
  const vendorId = input.vendorId.trim();
  const reason = auditReason(input.reason);
  if (!vendorId) throw new Error("Vendor is required");

  const db = database();
  const vendor = await db.query<SqlRow>(`
    SELECT id::text AS vendor_uuid,public_id
    FROM vendor_businesses
    WHERE public_id=$1 OR id::text=$1
    LIMIT 1
  `, [vendorId]);
  const row = vendor.rows[0];
  if (!row) throw new Error("Vendor not found");

  const archived = await db.query<SqlRow>(`
    UPDATE vendor_offers vo
    SET status='archived',
        source_payload=COALESCE(vo.source_payload,'{}'::jsonb)
          || jsonb_build_object(
            'adminUnassigned',true,
            'adminUnassignedAt',now(),
            'catalogue','vitex',
            'bulkAssignment',true
          ),
        updated_at=now()
    FROM canonical_variants cv
    JOIN brands b ON b.id=cv.brand_id
    WHERE vo.vendor_id=$1::uuid
      AND vo.canonical_variant_id=cv.id
      AND b.normalized_name='vitex'
      AND vo.status <> 'archived'
    RETURNING vo.id
  `, [asText(row.vendor_uuid)]);

  const total = await db.query<SqlRow>(`
    SELECT count(*)::int AS total
    FROM canonical_variants cv
    JOIN brands b ON b.id=cv.brand_id
    WHERE b.normalized_name='vitex'
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
  `);

  const response: VitexBulkAssignmentResult = {
    vendorId: asText(row.public_id),
    totalProducts: asInt(total.rows[0]?.total),
    inserted: 0,
    reactivated: 0,
    archived: archived.rowCount ?? 0
  };
  await recordAdminAudit(
    principal,
    "catalog.vendor_vitex.bulk_unassigned",
    "vendor",
    response.vendorId,
    reason,
    response
  );
  return response;
}

export async function adminUpdateVitexPublicContent(
  principal: SessionPrincipal,
  input: VitexPublicContentInput
): Promise<VitexPublicContentResult> {
  assertAdminPermission(principal, "catalog.write");
  const canonicalId = input.canonicalId.trim();
  if (!canonicalId) throw new Error("Canonical product is required");

  const title = input.title.trim();
  if (title.length < 3 || title.length > 240) throw new Error("Public title must be between 3 and 240 characters");
  const description = boundedText(input.description, 12_000);
  const seoTitle = boundedText(input.seoTitle, 300);
  const seoDescription = boundedText(input.seoDescription, 600);
  const imageUrl = publicImageUrl(input.imageUrl);
  const reason = auditReason(input.reason);

  const db = database();
  const mutation = await db.query<SqlRow>(`
    WITH target AS (
      SELECT cv.id AS canonical_uuid,cv.public_id,cv.slug,vcp.import_fingerprint
      FROM vitex_commerce_products vcp
      JOIN canonical_variants cv ON cv.id=vcp.canonical_variant_id
      WHERE cv.public_id=$1 OR cv.id::text=$1
      LIMIT 1
    ),
    translation AS (
      INSERT INTO product_translations(
        canonical_variant_id,locale,title,description,specifications,seo_title,seo_description
      )
      SELECT target.canonical_uuid,'el',$2,$3,'{}'::jsonb,$4,$5
      FROM target
      ON CONFLICT (canonical_variant_id,locale) DO UPDATE
      SET title=EXCLUDED.title,
          description=EXCLUDED.description,
          seo_title=EXCLUDED.seo_title,
          seo_description=EXCLUDED.seo_description
      RETURNING canonical_variant_id
    ),
    canonical_touch AS (
      UPDATE canonical_variants cv
      SET updated_at=now()
      FROM target
      WHERE cv.id=target.canonical_uuid
      RETURNING cv.id
    ),
    media_touch AS (
      UPDATE catalog_source_products csp
      SET source_image_url=$6
      FROM target,catalog_sources cs
      WHERE $6::text IS NOT NULL
        AND csp.source_id=cs.id
        AND cs.code='vitex-commerce-media'
        AND csp.source_product_key=target.import_fingerprint
      RETURNING csp.id
    )
    SELECT target.public_id,target.slug,
           EXISTS(SELECT 1 FROM translation) AS translation_updated,
           EXISTS(SELECT 1 FROM canonical_touch) AS canonical_updated,
           CASE WHEN $6::text IS NULL THEN true ELSE EXISTS(SELECT 1 FROM media_touch) END AS media_updated
    FROM target
  `, [canonicalId, title, description, seoTitle, seoDescription, imageUrl]);

  const row = mutation.rows[0];
  if (!row) throw new Error("VITEX canonical product not found");
  if (!Boolean(row.translation_updated) || !Boolean(row.canonical_updated) || !Boolean(row.media_updated)) {
    throw new Error("VITEX public content update did not complete");
  }

  const response = {
    canonicalId: asText(row.public_id),
    slug: asText(row.slug),
    title
  };
  await recordAdminAudit(
    principal,
    "catalog.vitex.public_content_updated",
    "canonical_product",
    response.canonicalId,
    reason,
    {
      title,
      descriptionSet: Boolean(description),
      seoTitleSet: Boolean(seoTitle),
      seoDescriptionSet: Boolean(seoDescription),
      imageUpdated: Boolean(imageUrl)
    }
  );
  return response;
}
