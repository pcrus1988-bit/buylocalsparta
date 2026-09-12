import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";
import type {
  DropshippingProductRow,
  DropshippingSupplierDefaults,
  DropshippingSupplierSummary,
  DropshippingWorkspace
} from "./vendor-dropshipping-service";

export type DropshippingPublicationFilter = "all" | "published" | "unpublished";
export type DropshippingAvailabilityFilter = "all" | "available" | "out_of_stock";
export type DropshippingCostFilter = "all" | "with_cost" | "missing_cost";
export type DropshippingAdjustmentFilter = "all" | "with" | "without" | "percent" | "fixed";
export type DropshippingPricingFlagFilter = "all" | "OVERPRICED" | "OK";

export type DropshippingProductFilters = Readonly<{
  categoryId: string;
  subcategoryId: string;
  brandId: string;
  size: string;
  color: string;
  publication: DropshippingPublicationFilter;
  availability: DropshippingAvailabilityFilter;
  cost: DropshippingCostFilter;
  markup: DropshippingAdjustmentFilter;
  discount: DropshippingAdjustmentFilter;
  pricingFlag: DropshippingPricingFlagFilter;
  markupMin: number | null;
  markupMax: number | null;
  discountMin: number | null;
  discountMax: number | null;
}>;

export type DropshippingFacetOption = Readonly<{
  value: string;
  label: string;
  count: number;
  parentValue: string | null;
}>;

export type DropshippingFilterOptions = Readonly<{
  categories: readonly DropshippingFacetOption[];
  subcategories: readonly DropshippingFacetOption[];
  brands: readonly DropshippingFacetOption[];
  sizes: readonly DropshippingFacetOption[];
  colors: readonly DropshippingFacetOption[];
}>;

export type DropshippingFilteredProductRow = DropshippingProductRow & Readonly<{
  categoryId: string | null;
  category: string | null;
  subcategoryId: string | null;
  subcategory: string | null;
  size: string | null;
  color: string | null;
  pricingFlag: string | null;
  published: boolean;
}>;

export type DropshippingFilteredWorkspace = Omit<DropshippingWorkspace, "products"> & Readonly<{
  products: readonly DropshippingFilteredProductRow[];
  filters: DropshippingProductFilters;
  filterOptions: DropshippingFilterOptions;
}>;

export type DropshippingFilterInput = Readonly<{
  categoryId?: string | null;
  subcategoryId?: string | null;
  brandId?: string | null;
  size?: string | null;
  color?: string | null;
  publication?: string | null;
  availability?: string | null;
  cost?: string | null;
  markup?: string | null;
  discount?: string | null;
  pricingFlag?: string | null;
  markupMin?: string | number | null;
  markupMax?: string | number | null;
  discountMin?: string | number | null;
  discountMax?: string | number | null;
}>;

const EMPTY_OPTIONS: DropshippingFilterOptions = {
  categories: [],
  subcategories: [],
  brands: [],
  sizes: [],
  colors: []
};

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

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = compact(value, 40) as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function numberOrNull(value: unknown, min: number, max: number): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

function orderedRange(a: number | null, b: number | null): readonly [number | null, number | null] {
  if (a == null || b == null || a <= b) return [a, b];
  return [b, a];
}

export function normalizeDropshippingProductFilters(input: DropshippingFilterInput = {}): DropshippingProductFilters {
  const [markupMin, markupMax] = orderedRange(
    numberOrNull(input.markupMin, 0, 1000),
    numberOrNull(input.markupMax, 0, 1000)
  );
  const [discountMin, discountMax] = orderedRange(
    numberOrNull(input.discountMin, 0, 100),
    numberOrNull(input.discountMax, 0, 100)
  );
  return {
    categoryId: compact(input.categoryId, 80),
    subcategoryId: compact(input.subcategoryId, 80),
    brandId: compact(input.brandId, 80),
    size: compact(input.size, 120),
    color: compact(input.color, 120),
    publication: oneOf(input.publication, ["all", "published", "unpublished"] as const, "all"),
    availability: oneOf(input.availability, ["all", "available", "out_of_stock"] as const, "all"),
    cost: oneOf(input.cost, ["all", "with_cost", "missing_cost"] as const, "all"),
    markup: oneOf(input.markup, ["all", "with", "without", "percent", "fixed"] as const, "all"),
    discount: oneOf(input.discount, ["all", "with", "without", "percent", "fixed"] as const, "all"),
    pricingFlag: oneOf(input.pricingFlag, ["all", "OVERPRICED", "OK"] as const, "all"),
    markupMin,
    markupMax,
    discountMin,
    discountMax
  };
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
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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

function facetOptions(rows: readonly Record<string, unknown>[], kind: string): readonly DropshippingFacetOption[] {
  return rows.filter((row) => row.kind === kind).map((row) => ({
    value: String(row.value),
    label: String(row.label),
    count: asNumber(row.item_count),
    parentValue: row.parent_value ? String(row.parent_value) : null
  }));
}

async function loadSupplierSummaries(vendorId: string): Promise<readonly DropshippingSupplierSummary[]> {
  const supplierResult = await getProductionPostgresRuntime().nativePool.query(`
    SELECT ds.id::text id, ds.public_id, ds.code, ds.display_name, ds.provider_kind, ds.active,
           ds.catalogue_sync_enabled, ds.order_forwarding_enabled, ds.tracking_sync_enabled,
           ds.last_healthcheck_at, ds.last_healthcheck_ok,
           ds.configuration->'vendorMerchandising' vendor_merchandising,
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

  return supplierResult.rows.map((row) => ({
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
    lastCatalogueSyncAt: asNullableIso(row.last_catalogue_sync_at),
    defaults: supplierDefaults(row.vendor_merchandising)
  }));
}

export async function vendorDropshippingFilteredWorkspace(
  vendorIdentity: string,
  options: Readonly<{
    supplierCode?: string | null;
    query?: string | null;
    page?: number;
    pageSize?: number;
    filters?: DropshippingFilterInput;
  }> = {}
): Promise<DropshippingFilteredWorkspace> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  const filters = normalizeDropshippingProductFilters(options.filters);
  const query = compact(options.query, 120);
  const pageSize = Math.min(100, Math.max(20, Number.isSafeInteger(options.pageSize) ? Number(options.pageSize) : 50));
  const page = Math.max(1, Number.isSafeInteger(options.page) ? Number(options.page) : 1);

  if (!productionDatabaseConfigured()) {
    return { suppliers: [], selectedSupplier: null, products: [], totalProducts: 0, page, pageSize, query, filters, filterOptions: EMPTY_OPTIONS };
  }

  const pool = getProductionPostgresRuntime().nativePool;
  const vendorId = await resolveVendorUuid(vendorIdentity);
  const suppliers = await loadSupplierSummaries(vendorId);
  const selectedSupplier = suppliers.find((supplier) => supplier.code === options.supplierCode) ?? suppliers[0] ?? null;
  const base: Omit<DropshippingWorkspace, "products"> = { suppliers, selectedSupplier, totalProducts: 0, page, pageSize, query };
  if (!selectedSupplier) return { ...base, products: [], filters, filterOptions: EMPTY_OPTIONS };

  const supplierId = selectedSupplier.id;
  const [productResult, facetResult] = await Promise.all([
    pool.query(`
      SELECT count(*) OVER()::bigint total_count,
             vo.public_id offer_id, dso.public_id supplier_offer_id, cv.public_id canonical_variant_id,
             coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id) title,
             b.name brand, dso.external_sku, dso.ean, dso.supplier_cost_minor,
             vo.customer_price_minor, vo.msrp_minor, vo.show_msrp,
             coalesce(pp.pricing_mode,'manual') pricing_mode, pp.markup_type, pp.markup_value,
             pp.discount_type, pp.discount_value,
             vo.source_payload->>'pricingFlag' pricing_flag,
             vo.merchant_visible, dso.active supplier_active, dso.cached_available, dso.cached_quantity,
             dso.availability_checked_at, dso.last_catalogue_sync_at,
             CASE WHEN c.parent_id IS NULL THEN c.id::text ELSE pc.id::text END category_id,
             CASE WHEN c.parent_id IS NULL THEN coalesce(ct_el.name,ct_en.name,c.slug)
                  ELSE coalesce(pct_el.name,pct_en.name,pc.slug) END category_name,
             CASE WHEN c.parent_id IS NOT NULL THEN c.id::text END subcategory_id,
             CASE WHEN c.parent_id IS NOT NULL THEN coalesce(ct_el.name,ct_en.name,c.slug) END subcategory_name,
             nullif(btrim(coalesce(cv.variant_attributes->>'size',cv.variant_attributes->>'Size',cv.variant_attributes->>'shoe_size',cv.variant_attributes->>'clothing_size')), '') size_value,
             nullif(btrim(coalesce(cv.variant_attributes->>'color',cv.variant_attributes->>'colour',cv.variant_attributes->>'Color',cv.variant_attributes->>'Colour')), '') color_value,
             (dso.active AND vo.merchant_visible AND vo.status='approved') published
        FROM dropship_supplier_offers dso
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
        LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
        LEFT JOIN brands b ON b.id=cv.brand_id
        LEFT JOIN categories c ON c.id=cv.category_id
        LEFT JOIN categories pc ON pc.id=c.parent_id
        LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
        LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
        LEFT JOIN category_translations pct_el ON pct_el.category_id=pc.id AND pct_el.locale='el'
        LEFT JOIN category_translations pct_en ON pct_en.category_id=pc.id AND pct_en.locale='en'
        LEFT JOIN vendor_offer_pricing_private pp ON pp.offer_id=vo.id
       WHERE ds.id=$1::uuid
         AND ds.owner_vendor_id=$2::uuid
         AND (
           $3::text=''
           OR coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id) ILIKE '%' || $3 || '%'
           OR coalesce(b.name,'') ILIKE '%' || $3 || '%'
           OR coalesce(dso.external_sku,'') ILIKE '%' || $3 || '%'
           OR coalesce(dso.ean,'') ILIKE '%' || $3 || '%'
           OR coalesce(dso.external_product_id,'') ILIKE '%' || $3 || '%'
           OR coalesce(ct_el.name,ct_en.name,c.slug,'') ILIKE '%' || $3 || '%'
           OR coalesce(pct_el.name,pct_en.name,pc.slug,'') ILIKE '%' || $3 || '%'
           OR coalesce(cv.variant_attributes->>'size',cv.variant_attributes->>'Size','') ILIKE '%' || $3 || '%'
           OR coalesce(cv.variant_attributes->>'color',cv.variant_attributes->>'colour','') ILIKE '%' || $3 || '%'
           OR coalesce(vo.source_payload->>'pricingFlag','') ILIKE '%' || $3 || '%'
         )
         AND ($4::text='' OR (CASE WHEN c.parent_id IS NULL THEN c.id::text ELSE pc.id::text END)=$4)
         AND ($5::text='' OR (c.parent_id IS NOT NULL AND c.id::text=$5))
         AND ($6::text='' OR b.id::text=$6)
         AND ($7::text='' OR lower(btrim(coalesce(cv.variant_attributes->>'size',cv.variant_attributes->>'Size',cv.variant_attributes->>'shoe_size',cv.variant_attributes->>'clothing_size','')))=lower(btrim($7)))
         AND ($8::text='' OR lower(btrim(coalesce(cv.variant_attributes->>'color',cv.variant_attributes->>'colour',cv.variant_attributes->>'Color',cv.variant_attributes->>'Colour','')))=lower(btrim($8)))
         AND ($9::text='all' OR ($9='published' AND dso.active AND vo.merchant_visible AND vo.status='approved') OR ($9='unpublished' AND NOT (dso.active AND vo.merchant_visible AND vo.status='approved')))
         AND ($10::text='all' OR ($10='available' AND dso.cached_available) OR ($10='out_of_stock' AND NOT dso.cached_available))
         AND ($11::text='all' OR ($11='with_cost' AND dso.supplier_cost_minor IS NOT NULL) OR ($11='missing_cost' AND dso.supplier_cost_minor IS NULL))
         AND ($12::text='all' OR ($12='with' AND coalesce(pp.markup_value,0)<>0) OR ($12='without' AND coalesce(pp.markup_value,0)=0) OR ($12='percent' AND pp.markup_type='percent' AND pp.markup_value IS NOT NULL) OR ($12='fixed' AND pp.markup_type='fixed' AND pp.markup_value IS NOT NULL))
         AND ($13::text='all' OR ($13='with' AND coalesce(pp.discount_value,0)<>0) OR ($13='without' AND coalesce(pp.discount_value,0)=0) OR ($13='percent' AND pp.discount_type='percent' AND pp.discount_value IS NOT NULL) OR ($13='fixed' AND pp.discount_type='fixed' AND pp.discount_value IS NOT NULL))
         AND ($14::numeric IS NULL OR (pp.markup_type='percent' AND pp.markup_value >= $14))
         AND ($15::numeric IS NULL OR (pp.markup_type='percent' AND pp.markup_value <= $15))
         AND ($16::numeric IS NULL OR (pp.discount_type='percent' AND pp.discount_value >= $16))
         AND ($17::numeric IS NULL OR (pp.discount_type='percent' AND pp.discount_value <= $17))
         AND (
           $18::text='all'
           OR ($18='OVERPRICED' AND vo.source_payload->>'pricingFlag'='OVERPRICED')
           OR ($18='OK' AND coalesce(vo.source_payload->>'pricingFlag','')<>'OVERPRICED')
         )
       ORDER BY coalesce(pt_el.title,pt_en.title,cv.model,cv.slug,cv.public_id), vo.public_id
       LIMIT $19 OFFSET $20
    `, [
      supplierId,vendorId,query,filters.categoryId,filters.subcategoryId,filters.brandId,filters.size,filters.color,
      filters.publication,filters.availability,filters.cost,filters.markup,filters.discount,
      filters.markupMin,filters.markupMax,filters.discountMin,filters.discountMax,filters.pricingFlag,
      pageSize,(page - 1) * pageSize
    ]),
    pool.query(`
      WITH base AS (
        SELECT
          CASE WHEN c.parent_id IS NULL THEN c.id::text ELSE pc.id::text END category_id,
          CASE WHEN c.parent_id IS NULL THEN coalesce(ct_el.name,ct_en.name,c.slug) ELSE coalesce(pct_el.name,pct_en.name,pc.slug) END category_name,
          CASE WHEN c.parent_id IS NOT NULL THEN c.id::text END subcategory_id,
          CASE WHEN c.parent_id IS NOT NULL THEN coalesce(ct_el.name,ct_en.name,c.slug) END subcategory_name,
          b.id::text brand_id,b.name brand_name,
          nullif(btrim(coalesce(cv.variant_attributes->>'size',cv.variant_attributes->>'Size',cv.variant_attributes->>'shoe_size',cv.variant_attributes->>'clothing_size')), '') size_value,
          nullif(btrim(coalesce(cv.variant_attributes->>'color',cv.variant_attributes->>'colour',cv.variant_attributes->>'Color',cv.variant_attributes->>'Colour')), '') color_value
        FROM dropship_supplier_offers dso
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN brands b ON b.id=cv.brand_id
        LEFT JOIN categories c ON c.id=cv.category_id
        LEFT JOIN categories pc ON pc.id=c.parent_id
        LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
        LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
        LEFT JOIN category_translations pct_el ON pct_el.category_id=pc.id AND pct_el.locale='el'
        LEFT JOIN category_translations pct_en ON pct_en.category_id=pc.id AND pct_en.locale='en'
       WHERE ds.id=$1::uuid AND ds.owner_vendor_id=$2::uuid
      ), facets AS (
        SELECT 'category'::text kind, category_id value, min(category_name) label, NULL::text parent_value, count(*)::bigint item_count FROM base WHERE category_id IS NOT NULL AND category_name IS NOT NULL GROUP BY category_id
        UNION ALL
        SELECT 'subcategory', subcategory_id, min(subcategory_name), category_id, count(*)::bigint FROM base WHERE subcategory_id IS NOT NULL AND subcategory_name IS NOT NULL GROUP BY subcategory_id,category_id
        UNION ALL
        SELECT 'brand', brand_id, min(brand_name), NULL::text, count(*)::bigint FROM base WHERE brand_id IS NOT NULL AND brand_name IS NOT NULL GROUP BY brand_id
        UNION ALL
        SELECT 'size', lower(size_value), min(size_value), NULL::text, count(*)::bigint FROM base WHERE size_value IS NOT NULL GROUP BY lower(size_value)
        UNION ALL
        SELECT 'color', lower(color_value), min(color_value), NULL::text, count(*)::bigint FROM base WHERE color_value IS NOT NULL GROUP BY lower(color_value)
      )
      SELECT kind,value,label,parent_value,item_count FROM facets ORDER BY kind,lower(label),label
    `, [supplierId,vendorId])
  ]);

  const products: DropshippingFilteredProductRow[] = productResult.rows.map((row) => ({
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
    lastCatalogueSyncAt: asNullableIso(row.last_catalogue_sync_at),
    categoryId: row.category_id ? String(row.category_id) : null,
    category: row.category_name ? String(row.category_name) : null,
    subcategoryId: row.subcategory_id ? String(row.subcategory_id) : null,
    subcategory: row.subcategory_name ? String(row.subcategory_name) : null,
    size: row.size_value ? String(row.size_value) : null,
    color: row.color_value ? String(row.color_value) : null,
    pricingFlag: row.pricing_flag ? String(row.pricing_flag) : null,
    published: Boolean(row.published)
  }));

  const facetRows = facetResult.rows as Record<string, unknown>[];
  return {
    ...base,
    products,
    totalProducts: productResult.rows.length ? asNumber(productResult.rows[0].total_count) : 0,
    page,
    pageSize,
    query,
    filters,
    filterOptions: {
      categories: facetOptions(facetRows, "category"),
      subcategories: facetOptions(facetRows, "subcategory"),
      brands: facetOptions(facetRows, "brand"),
      sizes: facetOptions(facetRows, "size"),
      colors: facetOptions(facetRows, "color")
    }
  };
}
