import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";
import type { DropshippingSupplierDefaults } from "./vendor-dropshipping-service";

export type DropshippingSearchSupplier = Readonly<{
  id: string;
  code: string;
  displayName: string;
  providerKind: string;
  active: boolean;
  defaults: DropshippingSupplierDefaults;
}>;

export type DropshippingSearchProduct = Readonly<{
  offerId: string;
  supplierOfferId: string;
  canonicalVariantId: string;
  title: string;
  brand: string | null;
  externalSku: string | null;
  ean: string | null;
  supplierCostMinor: number | null;
  customerPriceMinor: number;
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
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
 * Lightweight supplier navigation for the dropshipping workspace.
 * Intentionally does not join or aggregate catalogue rows. The page must stay
 * fast even when a supplier has tens of thousands of offers.
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
           ds.configuration->'vendorMerchandising' vendor_merchandising
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
    defaults: supplierDefaults(row.vendor_merchandising)
  }));
}

/**
 * Search-only product access. Empty/short queries never touch catalogue rows.
 * Results are hard-bounded so the vendor workspace can never preload or render
 * the full supplier catalogue.
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
    SELECT id::text id
      FROM dropship_suppliers
     WHERE owner_vendor_id=$1::uuid
       AND code=$2
     LIMIT 1
  `, [vendorId, supplierCode]);
  if (!supplier.rowCount) return [];
  const supplierId = String(supplier.rows[0].id);

  const result = await pool.query(`
    SELECT vo.public_id offer_id,
           dso.public_id supplier_offer_id,
           cv.public_id canonical_variant_id,
           coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id) title,
           b.name brand,
           dso.external_sku,
           dso.ean,
           dso.supplier_cost_minor,
           vo.customer_price_minor,
           vo.msrp_minor,
           vo.show_msrp,
           pp.markup_type,
           pp.markup_value,
           pp.discount_type,
           pp.discount_value,
           vo.merchant_visible,
           dso.active supplier_active,
           dso.cached_available,
           dso.cached_quantity,
           dso.availability_checked_at,
           vo.source_payload->>'pricingFlag' pricing_flag,
           (dso.active AND vo.merchant_visible AND vo.status='approved') published
      FROM dropship_supplier_offers dso
      JOIN vendor_offers vo
        ON vo.id=dso.vendor_offer_id
       AND vo.vendor_id=$2::uuid
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      LEFT JOIN product_translations pt_el
        ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
      LEFT JOIN product_translations pt_en
        ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN vendor_offer_pricing_private pp ON pp.offer_id=vo.id
     WHERE dso.supplier_id=$1::uuid
       AND (
         coalesce(dso.ean,'')=$3
         OR coalesce(dso.external_sku,'')=$3
         OR coalesce(dso.external_product_id,'')=$3
         OR coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id) ILIKE '%' || $3 || '%'
         OR coalesce(b.name,'') ILIKE '%' || $3 || '%'
         OR coalesce(dso.external_sku,'') ILIKE '%' || $3 || '%'
         OR coalesce(dso.ean,'') ILIKE '%' || $3 || '%'
         OR coalesce(dso.external_product_id,'') ILIKE '%' || $3 || '%'
       )
     ORDER BY
       CASE WHEN coalesce(dso.ean,'')=$3 OR coalesce(dso.external_sku,'')=$3 OR coalesce(dso.external_product_id,'')=$3 THEN 0 ELSE 1 END,
       coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id),
       vo.public_id
     LIMIT $4
  `, [supplierId, vendorId, query, limit]);

  return result.rows.map((row) => ({
    offerId: String(row.offer_id),
    supplierOfferId: String(row.supplier_offer_id),
    canonicalVariantId: String(row.canonical_variant_id),
    title: String(row.title),
    brand: row.brand ? String(row.brand) : null,
    externalSku: row.external_sku ? String(row.external_sku) : null,
    ean: row.ean ? String(row.ean) : null,
    supplierCostMinor: asNullableNumber(row.supplier_cost_minor),
    customerPriceMinor: asNumber(row.customer_price_minor),
    msrpMinor: asNullableNumber(row.msrp_minor),
    showMsrp: Boolean(row.show_msrp),
    markupType: adjustmentType(row.markup_type),
    markupValue: asNullableNumber(row.markup_value),
    discountType: adjustmentType(row.discount_type),
    discountValue: asNullableNumber(row.discount_value),
    visible: Boolean(row.merchant_visible),
    published: Boolean(row.published),
    supplierActive: Boolean(row.supplier_active),
    cachedAvailable: Boolean(row.cached_available),
    cachedQuantity: asNullableNumber(row.cached_quantity),
    availabilityCheckedAt: asNullableIso(row.availability_checked_at),
    pricingFlag: row.pricing_flag ? String(row.pricing_flag) : null
  }));
}
