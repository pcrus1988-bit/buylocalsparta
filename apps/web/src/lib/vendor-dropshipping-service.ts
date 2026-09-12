import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";

export type DropshippingSupplierSummary = Readonly<{
  id: string;
  publicId: string;
  code: string;
  displayName: string;
  providerKind: string;
  active: boolean;
  catalogueSyncEnabled: boolean;
  orderForwardingEnabled: boolean;
  trackingSyncEnabled: boolean;
  lastHealthcheckAt: string | null;
  lastHealthcheckOk: boolean | null;
  totalProducts: number;
  publishedProducts: number;
  availableProducts: number;
  outOfStockProducts: number;
  productsWithCost: number;
  lastCatalogueSyncAt: string | null;
}>;

export type DropshippingProductRow = Readonly<{
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
  pricingMode: "manual" | "calculated";
  markupType: "percent" | "fixed" | null;
  markupValue: number | null;
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  visible: boolean;
  supplierActive: boolean;
  cachedAvailable: boolean;
  cachedQuantity: number | null;
  availabilityCheckedAt: string | null;
  lastCatalogueSyncAt: string | null;
}>;

export type DropshippingWorkspace = Readonly<{
  suppliers: readonly DropshippingSupplierSummary[];
  selectedSupplier: DropshippingSupplierSummary | null;
  products: readonly DropshippingProductRow[];
  totalProducts: number;
  page: number;
  pageSize: number;
  query: string;
}>;

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
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function adjustmentType(value: unknown): "percent" | "fixed" | null {
  return value === "percent" || value === "fixed" ? value : null;
}

export async function vendorDropshippingWorkspace(
  vendorIdentity: string,
  options: Readonly<{ supplierCode?: string | null; query?: string | null; page?: number; pageSize?: number }> = {}
): Promise<DropshippingWorkspace> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) return { suppliers: [], selectedSupplier: null, products: [], totalProducts: 0, page: 1, pageSize: 50, query: "" };

  const pool = getProductionPostgresRuntime().nativePool;
  const vendor = await pool.query(`SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [vendorIdentity]);
  if (!vendor.rowCount) throw new Error("DROPSHIPPING_VENDOR_NOT_FOUND");
  const vendorId = String(vendor.rows[0].id);

  const supplierResult = await pool.query(`
    SELECT ds.id::text id, ds.public_id, ds.code, ds.display_name, ds.provider_kind, ds.active,
           ds.catalogue_sync_enabled, ds.order_forwarding_enabled, ds.tracking_sync_enabled,
           ds.last_healthcheck_at, ds.last_healthcheck_ok,
           count(dso.id)::bigint total_products,
           count(dso.id) FILTER (WHERE dso.active AND vo.merchant_visible AND vo.status='approved')::bigint published_products,
           count(dso.id) FILTER (WHERE dso.active AND dso.cached_available)::bigint available_products,
           count(dso.id) FILTER (WHERE dso.active AND NOT dso.cached_available)::bigint out_of_stock_products,
           count(dso.id) FILTER (WHERE dso.supplier_cost_minor IS NOT NULL)::bigint products_with_cost,
           max(dso.last_catalogue_sync_at) last_catalogue_sync_at
      FROM dropship_suppliers ds
      LEFT JOIN dropship_supplier_offers dso ON dso.supplier_id=ds.id
      LEFT JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
     WHERE ds.owner_vendor_id=$1::uuid
     GROUP BY ds.id
     ORDER BY ds.display_name, ds.code
  `, [vendorId]);

  const suppliers: DropshippingSupplierSummary[] = supplierResult.rows.map((row) => ({
    id: String(row.id),
    publicId: String(row.public_id),
    code: String(row.code),
    displayName: String(row.display_name),
    providerKind: String(row.provider_kind),
    active: Boolean(row.active),
    catalogueSyncEnabled: Boolean(row.catalogue_sync_enabled),
    orderForwardingEnabled: Boolean(row.order_forwarding_enabled),
    trackingSyncEnabled: Boolean(row.tracking_sync_enabled),
    lastHealthcheckAt: asNullableIso(row.last_healthcheck_at),
    lastHealthcheckOk: row.last_healthcheck_ok == null ? null : Boolean(row.last_healthcheck_ok),
    totalProducts: asNumber(row.total_products),
    publishedProducts: asNumber(row.published_products),
    availableProducts: asNumber(row.available_products),
    outOfStockProducts: asNumber(row.out_of_stock_products),
    productsWithCost: asNumber(row.products_with_cost),
    lastCatalogueSyncAt: asNullableIso(row.last_catalogue_sync_at)
  }));

  const selectedSupplier = suppliers.find((supplier) => supplier.code === options.supplierCode) ?? suppliers[0] ?? null;
  const pageSize = Math.min(100, Math.max(20, Number.isSafeInteger(options.pageSize) ? Number(options.pageSize) : 50));
  const page = Math.max(1, Number.isSafeInteger(options.page) ? Number(options.page) : 1);
  const query = String(options.query ?? "").trim().slice(0, 120);
  if (!selectedSupplier) return { suppliers, selectedSupplier: null, products: [], totalProducts: 0, page, pageSize, query };

  const productResult = await pool.query(`
    SELECT count(*) OVER()::bigint total_count,
           vo.public_id offer_id, dso.public_id supplier_offer_id, cv.public_id canonical_variant_id,
           coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id) title,
           b.name brand, dso.external_sku, dso.ean, dso.supplier_cost_minor,
           vo.customer_price_minor, vo.msrp_minor, vo.show_msrp,
           coalesce(pp.pricing_mode,'manual') pricing_mode, pp.markup_type, pp.markup_value,
           pp.discount_type, pp.discount_value,
           vo.merchant_visible, dso.active supplier_active, dso.cached_available, dso.cached_quantity,
           dso.availability_checked_at, dso.last_catalogue_sync_at
      FROM dropship_supplier_offers dso
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
      LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN vendor_offer_pricing_private pp ON pp.offer_id=vo.id
     WHERE ds.id=$1::uuid
       AND ds.owner_vendor_id=$2::uuid
       AND (
         $3::text=''
         OR coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id) ILIKE '%' || $3 || '%'
         OR coalesce(b.name,'') ILIKE '%' || $3 || '%'
         OR coalesce(dso.external_sku,'') ILIKE '%' || $3 || '%'
         OR coalesce(dso.ean,'') ILIKE '%' || $3 || '%'
         OR dso.external_product_id ILIKE '%' || $3 || '%'
       )
     ORDER BY coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id), vo.public_id
     LIMIT $4 OFFSET $5
  `, [selectedSupplier.id, vendorId, query, pageSize, (page - 1) * pageSize]);

  const products: DropshippingProductRow[] = productResult.rows.map((row) => ({
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
    pricingMode: row.pricing_mode === "calculated" ? "calculated" : "manual",
    markupType: adjustmentType(row.markup_type),
    markupValue: asNullableNumber(row.markup_value),
    discountType: adjustmentType(row.discount_type),
    discountValue: asNullableNumber(row.discount_value),
    visible: Boolean(row.merchant_visible),
    supplierActive: Boolean(row.supplier_active),
    cachedAvailable: Boolean(row.cached_available),
    cachedQuantity: asNullableNumber(row.cached_quantity),
    availabilityCheckedAt: asNullableIso(row.availability_checked_at),
    lastCatalogueSyncAt: asNullableIso(row.last_catalogue_sync_at)
  }));

  return {
    suppliers,
    selectedSupplier,
    products,
    totalProducts: productResult.rows.length ? asNumber(productResult.rows[0].total_count) : 0,
    page,
    pageSize,
    query
  };
}
