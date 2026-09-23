import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type FournarakisBulkAssignmentResult = Readonly<{
  vendorId: string;
  locationId?: string;
  totalProducts: number;
  assigned: number;
  reactivated: number;
  discontinued: number;
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

function database() {
  if (!productionDatabaseConfigured()) {
    throw new Error("Production database is required for Fournarakis catalogue administration");
  }
  return getProductionPostgresRuntime().sqlPool;
}

export async function adminAssignAllFournarakisProducts(
  principal: SessionPrincipal,
  input: Readonly<{ vendorId: string; locationId: string; reason: string }>
): Promise<FournarakisBulkAssignmentResult> {
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
    WITH source_context AS (
      SELECT cs.id AS source_id,j.snapshot_id
      FROM catalog_sources cs
      JOIN catalog_web_crawl_jobs j ON j.source_id=cs.id
      WHERE cs.code='fournarakis-gr'
        AND cs.active=true
        AND j.status='succeeded'
        AND j.snapshot_id IS NOT NULL
        AND COALESCE(j.promoted_product_count,0)>0
      ORDER BY j.completed_at DESC NULLS LAST,j.updated_at DESC,j.id DESC
      LIMIT 1
    ),
    target AS (
      SELECT csp.id AS source_product_id,
             lnk.canonical_variant_id,
             NULLIF(csp.supplier_code,'') AS source_sku,
             csp.source_product_key,
             csp.source_url,
             price.amount_minor AS reference_price_minor,
             price.price_kind AS reference_price_kind,
             price.source_reference AS reference_price_source
      FROM source_context ctx
      JOIN catalog_source_products csp
        ON csp.source_id=ctx.source_id
       AND csp.snapshot_id=ctx.snapshot_id
      JOIN catalog_source_product_links lnk
        ON lnk.source_product_id=csp.id
       AND lnk.link_status='approved'
       AND lnk.canonical_variant_id IS NOT NULL
      JOIN canonical_variants cv
        ON cv.id=lnk.canonical_variant_id
       AND cv.market_id=$1::uuid
       AND cv.suppressed=false
       AND cv.recalled=false
      LEFT JOIN LATERAL (
        SELECT po.amount_minor,po.price_kind,po.source_reference
        FROM catalog_price_observations po
        WHERE po.source_product_id=csp.id
          AND po.observation_status='observed'
        ORDER BY po.observed_at DESC NULLS LAST,po.created_at DESC,po.id DESC
        LIMIT 1
      ) price ON true
    ),
    before_state AS (
      SELECT vca.id,
             vca.source_product_id,
             vca.assortment_status AS old_status
      FROM vendor_catalog_assortments vca
      JOIN target t ON t.source_product_id=vca.source_product_id
      WHERE vca.vendor_id=$2::uuid
        AND vca.location_id=$3::uuid
    ),
    assortment AS (
      INSERT INTO vendor_catalog_assortments(
        market_id,vendor_id,location_id,source_product_id,canonical_variant_id,
        vendor_sku,assortment_status,availability_mode,confirmation_source,
        metadata,created_at,updated_at
      )
      SELECT
        $1::uuid,$2::uuid,$3::uuid,t.source_product_id,t.canonical_variant_id,
        COALESCE(t.source_sku,'FOURNARAKIS-'||upper(substr(md5(t.source_product_key),1,12))),
        'candidate','ask_vendor','admin',
        jsonb_strip_nulls(jsonb_build_object(
          'commercialConfirmationRequired',true,
          'priceConfirmationRequired',true,
          'stockConfirmationRequired',true,
          'catalogue','fournarakis',
          'sourceCode','fournarakis-gr',
          'sourceProductKey',t.source_product_key,
          'sourceUrl',t.source_url,
          'bulkAssignment',true,
          'referencePriceMinor',t.reference_price_minor,
          'referencePriceKind',t.reference_price_kind,
          'referencePriceSource',t.reference_price_source,
          'referencePriceIsVendorCost',false,
          'assignedAt',now(),
          'assignedBy',$4::text
        )),
        now(),now()
      FROM target t
      ON CONFLICT (vendor_id,location_id,source_product_id)
        WHERE source_product_id IS NOT NULL
      DO UPDATE
      SET canonical_variant_id=EXCLUDED.canonical_variant_id,
          vendor_sku=COALESCE(EXCLUDED.vendor_sku,vendor_catalog_assortments.vendor_sku),
          assortment_status=CASE
            WHEN vendor_catalog_assortments.assortment_status IN ('rejected','discontinued') THEN 'candidate'
            ELSE vendor_catalog_assortments.assortment_status
          END,
          availability_mode=CASE
            WHEN vendor_catalog_assortments.availability_mode IN ('unknown','unavailable') THEN 'ask_vendor'
            ELSE vendor_catalog_assortments.availability_mode
          END,
          confirmation_source='admin',
          metadata=COALESCE(vendor_catalog_assortments.metadata,'{}'::jsonb)||EXCLUDED.metadata,
          updated_at=now()
      RETURNING id,source_product_id
    )
    SELECT
      (SELECT count(*) FROM target)::int AS total_products,
      (SELECT count(*) FROM assortment)::int AS assigned,
      (
        SELECT count(*) FROM before_state
        WHERE old_status IN ('rejected','discontinued')
      )::int AS reactivated
  `, [asText(row.market_uuid), asText(row.vendor_uuid), asText(row.location_uuid), principal.userId]);

  const stats = result.rows[0] ?? {};
  const response: FournarakisBulkAssignmentResult = {
    vendorId: asText(row.vendor_public_id),
    locationId: asText(row.location_public_id),
    totalProducts: asInt(stats.total_products),
    assigned: asInt(stats.assigned),
    reactivated: asInt(stats.reactivated),
    discontinued: 0
  };

  await recordAdminAudit(
    principal,
    "catalog.vendor_fournarakis.bulk_assigned",
    "vendor",
    response.vendorId,
    reason,
    {
      ...response,
      commercialConfirmationRequired: true,
      createsVendorOffers: false,
      publishesStorefront: false
    }
  );

  return response;
}

export async function adminUnassignAllFournarakisProducts(
  principal: SessionPrincipal,
  input: Readonly<{ vendorId: string; reason: string }>
): Promise<FournarakisBulkAssignmentResult> {
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

  const result = await db.query<SqlRow>(`
    WITH source_context AS (
      SELECT cs.id AS source_id,j.snapshot_id
      FROM catalog_sources cs
      JOIN catalog_web_crawl_jobs j ON j.source_id=cs.id
      WHERE cs.code='fournarakis-gr'
        AND j.status='succeeded'
        AND j.snapshot_id IS NOT NULL
        AND COALESCE(j.promoted_product_count,0)>0
      ORDER BY j.completed_at DESC NULLS LAST,j.updated_at DESC,j.id DESC
      LIMIT 1
    ),
    source_products AS (
      SELECT csp.id
      FROM source_context ctx
      JOIN catalog_source_products csp
        ON csp.source_id=ctx.source_id
       AND csp.snapshot_id=ctx.snapshot_id
    ),
    discontinued AS (
      UPDATE vendor_catalog_assortments vca
      SET assortment_status='discontinued',
          metadata=COALESCE(vca.metadata,'{}'::jsonb)
            || jsonb_build_object(
              'adminUnassigned',true,
              'adminUnassignedAt',now(),
              'catalogue','fournarakis',
              'bulkAssignment',true
            ),
          updated_at=now()
      FROM source_products sp
      WHERE vca.vendor_id=$1::uuid
        AND vca.source_product_id=sp.id
        AND vca.assortment_status NOT IN ('rejected','discontinued')
      RETURNING vca.id
    )
    SELECT (SELECT count(*) FROM discontinued)::int AS discontinued
  `, [asText(row.vendor_uuid)]);

  const total = await db.query<SqlRow>(`
    WITH source_context AS (
      SELECT cs.id AS source_id,j.snapshot_id
      FROM catalog_sources cs
      JOIN catalog_web_crawl_jobs j ON j.source_id=cs.id
      WHERE cs.code='fournarakis-gr'
        AND j.status='succeeded'
        AND j.snapshot_id IS NOT NULL
        AND COALESCE(j.promoted_product_count,0)>0
      ORDER BY j.completed_at DESC NULLS LAST,j.updated_at DESC,j.id DESC
      LIMIT 1
    )
    SELECT count(*)::int AS total
    FROM source_context ctx
    JOIN catalog_source_products csp
      ON csp.source_id=ctx.source_id
     AND csp.snapshot_id=ctx.snapshot_id
    JOIN catalog_source_product_links l
      ON l.source_product_id=csp.id
     AND l.link_status='approved'
     AND l.canonical_variant_id IS NOT NULL
  `);

  const response: FournarakisBulkAssignmentResult = {
    vendorId: asText(row.public_id),
    totalProducts: asInt(total.rows[0]?.total),
    assigned: 0,
    reactivated: 0,
    discontinued: asInt(result.rows[0]?.discontinued)
  };

  await recordAdminAudit(
    principal,
    "catalog.vendor_fournarakis.bulk_unassigned",
    "vendor",
    response.vendorId,
    reason,
    { ...response, createsVendorOffers: false }
  );

  return response;
}
