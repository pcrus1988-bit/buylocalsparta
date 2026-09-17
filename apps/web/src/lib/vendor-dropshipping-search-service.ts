import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";
import type { DropshippingSupplierDefaults } from "./vendor-dropshipping-service";

export type DropshippingSearchSupplier = Readonly<{
  id: string;
  code: string;
  displayName: string;
  providerKind: string;
  active: boolean;
  productCount: number;
  defaults: DropshippingSupplierDefaults;
}>;

export type DropshippingSearchProduct = Readonly<{
  sourceProductId: string;
  sourceProductKey: string;
  offerId: string | null;
  supplierOfferId: string | null;
  canonicalVariantId: string | null;
  title: string;
  brand: string | null;
  externalSku: string | null;
  ean: string | null;
  supplierCostMinor: number | null;
  customerPriceMinor: number | null;
  msrpMinor: number | null;
  showMsrp: boolean;
  markupType: "percent" | "fixed" | null;
  markupValue: number | null;
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  visible: boolean;
  published: boolean;
  supplierActive: boolean;
  cachedAvailable: boolean;
  cachedQuantity: number | null;
  availabilityCheckedAt: string | null;
  pricingFlag: string | null;
  priceState: string | null;
}>;

const EMPTY_DEFAULTS: DropshippingSupplierDefaults = {
  configured: false,
  visible: false,
  markupPercent: 0,
  discountPercent: 0,
  showMsrp: false
};

function compact(value: unknown, maxLength = 160): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function asNullableIso(value: unknown): string | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function adjustmentType(value: unknown): "percent" | "fixed" | null {
  return value === "percent" || value === "fixed" ? value : null;
}

function supplierDefaults(value: unknown): DropshippingSupplierDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_DEFAULTS;
  const raw = value as Record<string, unknown>;
  if (Number(raw.version) !== 1) return EMPTY_DEFAULTS;
  const markupPercent = Number(raw.markupPercent);
  const discountPercent = Number(raw.discountPercent);
  if (!Number.isFinite(markupPercent) || !Number.isFinite(discountPercent)) return EMPTY_DEFAULTS;
  return {
    configured: true,
    visible: raw.visible === true,
    markupPercent,
    discountPercent,
    showMsrp: raw.showMsrp === true
  };
}

async function resolveVendorUuid(vendorIdentity: string): Promise<string> {
  const vendor = await getProductionPostgresRuntime().nativePool.query(
    `SELECT id::text id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`,
    [vendorIdentity]
  );
  if (!vendor.rowCount) throw new Error("DROPSHIPPING_VENDOR_NOT_FOUND");
  return String(vendor.rows[0].id);
}

/**
 * Supplier navigation for the dropshipping workspace.
 * Only a distinct source-product count is read; product rows themselves are
 * never loaded until the vendor performs a bounded search.
 */
export async function listDropshippingSearchSuppliers(
  vendorIdentity: string
): Promise<readonly DropshippingSearchSupplier[]> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) return [];

  const vendorId = await resolveVendorUuid(vendorIdentity);
  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT ds.id::text id,
           ds.code,
           ds.display_name,
           ds.provider_kind,
           ds.active,
           ds.configuration->'vendorMerchandising' vendor_merchandising,
           coalesce((
             SELECT count(DISTINCT coalesce(csp.source_product_key,csp.id::text))
               FROM catalog_source_products csp
              WHERE csp.source_id=ds.catalog_source_id
           ),0)::bigint product_count
      FROM dropship_suppliers ds
     WHERE ds.owner_vendor_id=$1::uuid
     ORDER BY ds.display_name, ds.code
  `, [vendorId]);

  return result.rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    displayName: String(row.display_name),
    providerKind: String(row.provider_kind),
    active: Boolean(row.active),
    productCount: asNumber(row.product_count),
    defaults: supplierDefaults(row.vendor_merchandising)
  }));
}

/**
 * Search-only product access. Empty/short queries never touch catalogue rows.
 *
 * Source catalogue rows are the search authority. This is intentionally not
 * driven by dropship_supplier_offers because ingestion and offer
 * materialisation are separate stages: a newly ingested supplier product must
 * be searchable before an offer exists. Repeated snapshot rows are collapsed
 * by source_product_key so the vendor sees one current product, not one row per
 * ingestion snapshot.
 */
export async function searchDropshippingProducts(
  vendorIdentity: string,
  supplierCodeInput: string,
  queryInput: string,
  requestedLimit = 40
): Promise<readonly DropshippingSearchProduct[]> {
  const supplierCode = compact(supplierCodeInput, 80);
  const query = compact(queryInput, 120);
  if (!supplierCode || query.length < 3) return [];

  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) return [];

  const vendorId = await resolveVendorUuid(vendorIdentity);
  const limit = Math.min(50, Math.max(1, Number.isSafeInteger(requestedLimit) ? requestedLimit : 40));
  const pool = getProductionPostgresRuntime().nativePool;

  const supplier = await pool.query(`
    SELECT id::text id,
           catalog_source_id::text catalog_source_id,
           active
      FROM dropship_suppliers
     WHERE owner_vendor_id=$1::uuid
       AND code=$2
     LIMIT 1
  `, [vendorId, supplierCode]);
  if (!supplier.rowCount || !supplier.rows[0].catalog_source_id) return [];

  const supplierId = String(supplier.rows[0].id);
  const catalogSourceId = String(supplier.rows[0].catalog_source_id);
  const supplierActive = Boolean(supplier.rows[0].active);

  const result = await pool.query(`
    WITH matching_source AS (
      SELECT DISTINCT ON (csp.source_product_key)
             csp.id,
             csp.source_product_key,
             csp.supplier_code,
             csp.title,
             csp.source_identity,
             csp.normalized_payload,
             csp.price_state,
             csp.created_at
        FROM catalog_source_products csp
       WHERE csp.source_id=$3::uuid
         AND (
           coalesce(csp.source_product_key,'')=$4
           OR coalesce(csp.supplier_code,'')=$4
           OR coalesce(csp.normalized_payload->>'sku','')=$4
           OR coalesce(csp.normalized_payload->>'barcode','')=$4
           OR coalesce(csp.title,'') ILIKE '%' || $4 || '%'
           OR coalesce(csp.normalized_payload->>'name','') ILIKE '%' || $4 || '%'
           OR coalesce(csp.normalized_payload#>>'{brand,name}','') ILIKE '%' || $4 || '%'
           OR coalesce(csp.source_identity->>'brand','') ILIKE '%' || $4 || '%'
           OR coalesce(csp.source_product_key,'') ILIKE '%' || $4 || '%'
           OR coalesce(csp.supplier_code,'') ILIKE '%' || $4 || '%'
           OR coalesce(csp.normalized_payload->>'sku','') ILIKE '%' || $4 || '%'
           OR coalesce(csp.normalized_payload->>'barcode','') ILIKE '%' || $4 || '%'
         )
       ORDER BY csp.source_product_key, csp.created_at DESC, csp.id DESC
    ), ranked_source AS (
      SELECT ms.*,
             CASE
               WHEN coalesce(ms.source_product_key,'')=$4
                 OR coalesce(ms.supplier_code,'')=$4
                 OR coalesce(ms.normalized_payload->>'sku','')=$4
                 OR coalesce(ms.normalized_payload->>'barcode','')=$4
               THEN 0 ELSE 1
             END exact_rank
        FROM matching_source ms
       ORDER BY exact_rank, coalesce(ms.title,ms.normalized_payload->>'name',ms.source_product_key), ms.source_product_key
       LIMIT $5
    )
    SELECT rs.id::text source_product_id,
           rs.source_product_key,
           dso.public_id supplier_offer_id,
           vo.public_id offer_id,
           cv.public_id canonical_variant_id,
           coalesce(pt_el.title,pt_en.title,rs.title,rs.normalized_payload->>'name',rs.source_product_key) title,
           coalesce(b.name,rs.normalized_payload#>>'{brand,name}',rs.source_identity->>'brand') brand,
           coalesce(dso.external_sku,rs.normalized_payload->>'sku',rs.supplier_code) external_sku,
           coalesce(dso.ean,rs.normalized_payload->>'barcode',rs.supplier_code) ean,
           coalesce(dso.supplier_cost_minor::text,rs.normalized_payload#>>'{prices,buyingCostMinor}') supplier_cost_minor,
           vo.customer_price_minor,
           coalesce(vo.msrp_minor::text,rs.normalized_payload#>>'{prices,msrpMinor}') msrp_minor,
           coalesce(vo.show_msrp,false) show_msrp,
           pp.markup_type,
           pp.markup_value,
           pp.discount_type,
           pp.discount_value,
           coalesce(vo.merchant_visible,false) merchant_visible,
           coalesce(dso.active::text,$6) supplier_active,
           coalesce(dso.cached_available::text,rs.normalized_payload#>>'{stock,available}','false') cached_available,
           coalesce(dso.cached_quantity::text,rs.normalized_payload#>>'{stock,stockQuantity}') cached_quantity,
           dso.availability_checked_at,
           vo.source_payload->>'pricingFlag' pricing_flag,
           rs.price_state,
           (coalesce(dso.active,false) AND coalesce(vo.merchant_visible,false) AND vo.status='approved') published
      FROM ranked_source rs
      LEFT JOIN LATERAL (
        SELECT candidate.*
          FROM dropship_supplier_offers candidate
         WHERE candidate.supplier_id=$1::uuid
           AND (
             candidate.source_product_id=rs.id
             OR coalesce(candidate.external_product_id,'')=coalesce(rs.source_product_key,'')
             OR coalesce(candidate.ean,'')=coalesce(rs.normalized_payload->>'barcode',rs.supplier_code,'')
           )
         ORDER BY CASE WHEN candidate.source_product_id=rs.id THEN 0 ELSE 1 END,
                  candidate.updated_at DESC,
                  candidate.id DESC
         LIMIT 1
      ) dso ON true
      LEFT JOIN vendor_offers vo
        ON vo.id=dso.vendor_offer_id
       AND vo.vendor_id=$2::uuid
      LEFT JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      LEFT JOIN product_translations pt_el
        ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
      LEFT JOIN product_translations pt_en
        ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN vendor_offer_pricing_private pp ON pp.offer_id=vo.id
     ORDER BY rs.exact_rank,
              coalesce(pt_el.title,pt_en.title,rs.title,rs.normalized_payload->>'name',rs.source_product_key),
              rs.source_product_key
  `, [supplierId, vendorId, catalogSourceId, query, limit, supplierActive ? "true" : "false"]);

  return result.rows.map((row) => ({
    sourceProductId: String(row.source_product_id),
    sourceProductKey: String(row.source_product_key ?? row.source_product_id),
    offerId: row.offer_id ? String(row.offer_id) : null,
    supplierOfferId: row.supplier_offer_id ? String(row.supplier_offer_id) : null,
    canonicalVariantId: row.canonical_variant_id ? String(row.canonical_variant_id) : null,
    title: String(row.title),
    brand: row.brand ? String(row.brand) : null,
    externalSku: row.external_sku ? String(row.external_sku) : null,
    ean: row.ean ? String(row.ean) : null,
    supplierCostMinor: asNullableNumber(row.supplier_cost_minor),
    customerPriceMinor: asNullableNumber(row.customer_price_minor),
    msrpMinor: asNullableNumber(row.msrp_minor),
    showMsrp: Boolean(row.show_msrp),
    markupType: adjustmentType(row.markup_type),
    markupValue: asNullableNumber(row.markup_value),
    discountType: adjustmentType(row.discount_type),
    discountValue: asNullableNumber(row.discount_value),
    visible: Boolean(row.merchant_visible),
    published: Boolean(row.published),
    supplierActive: asBoolean(row.supplier_active),
    cachedAvailable: asBoolean(row.cached_available),
    cachedQuantity: asNullableNumber(row.cached_quantity),
    availabilityCheckedAt: asNullableIso(row.availability_checked_at),
    pricingFlag: row.pricing_flag ? String(row.pricing_flag) : null,
    priceState: row.price_state ? String(row.price_state) : null
  }));
}
