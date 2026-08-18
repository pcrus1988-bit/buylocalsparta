import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorAnalyticsFilters = Readonly<{
  periodDays?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
  categoryId?: string | null;
  productId?: string | null;
}>;

export type VendorProductAnalyticsRow = Readonly<{
  canonicalVariantId: string;
  productTitle: string;
  categoryId: string | null;
  categoryName: string;
  impressions: number;
  pageViews: number;
  uniqueViewers: number;
  engagedSeconds: number;
  addToCarts: number;
  checkoutStarts: number;
  purchases: number;
  unitsSold: number;
  revenueMinor: number;
}>;

export type VendorAnalyticsOption = Readonly<{ id: string; label: string }>;

export type VendorProductAnalyticsReport = Readonly<{
  rows: readonly VendorProductAnalyticsRow[];
  products: readonly VendorAnalyticsOption[];
  categories: readonly VendorAnalyticsOption[];
  totals: VendorProductAnalyticsRow;
}>;

function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function emptyTotals(): VendorProductAnalyticsRow {
  return {
    canonicalVariantId: "all",
    productTitle: "Όλα τα προϊόντα",
    categoryId: null,
    categoryName: "Όλες οι κατηγορίες",
    impressions: 0,
    pageViews: 0,
    uniqueViewers: 0,
    engagedSeconds: 0,
    addToCarts: 0,
    checkoutStarts: 0,
    purchases: 0,
    unitsSold: 0,
    revenueMinor: 0
  };
}

function totalRows(rows: readonly VendorProductAnalyticsRow[]): VendorProductAnalyticsRow {
  const result = emptyTotals();
  return rows.reduce((acc, row) => ({
    ...acc,
    impressions: acc.impressions + row.impressions,
    pageViews: acc.pageViews + row.pageViews,
    uniqueViewers: acc.uniqueViewers + row.uniqueViewers,
    engagedSeconds: acc.engagedSeconds + row.engagedSeconds,
    addToCarts: acc.addToCarts + row.addToCarts,
    checkoutStarts: acc.checkoutStarts + row.checkoutStarts,
    purchases: acc.purchases + row.purchases,
    unitsSold: acc.unitsSold + row.unitsSold,
    revenueMinor: acc.revenueMinor + row.revenueMinor
  }), result);
}

export async function vendorProductAnalytics(vendorIdentity: string, filters: VendorAnalyticsFilters = {}): Promise<VendorProductAnalyticsReport> {
  if (!productionDatabaseConfigured()) return { rows: [], products: [], categories: [], totals: emptyTotals() };
  const pool = getProductionPostgresRuntime().nativePool;
  const vendor = await pool.query(`
    SELECT id
    FROM vendor_businesses
    WHERE public_id=$1 OR id::text=$1
    LIMIT 1
  `, [vendorIdentity]);
  if (!vendor.rowCount) return { rows: [], products: [], categories: [], totals: emptyTotals() };
  const vendorId = vendor.rows[0].id as string;

  const options = await pool.query(`
    WITH RECURSIVE vendor_products AS (
      SELECT DISTINCT cv.id, cv.public_id,
        coalesce(pt_el.title, pt_en.title, cv.model, cv.public_id) AS product_title,
        coalesce(cv.category_id, pf.category_id) AS category_id
      FROM canonical_variants cv
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
      LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
      WHERE EXISTS (SELECT 1 FROM vendor_offers vo WHERE vo.vendor_id=$1 AND vo.canonical_variant_id=cv.id)
    ), used_categories AS (
      SELECT DISTINCT category_id AS id FROM vendor_products WHERE category_id IS NOT NULL
      UNION
      SELECT DISTINCT ca.category_id
      FROM canonical_variant_category_assignments ca
      JOIN vendor_products vp ON vp.id=ca.canonical_variant_id
    ), category_ancestors AS (
      SELECT c.id, c.parent_id, c.code, c.slug FROM categories c JOIN used_categories u ON u.id=c.id
      UNION
      SELECT p.id, p.parent_id, p.code, p.slug
      FROM categories p JOIN category_ancestors a ON a.parent_id=p.id
    )
    SELECT 'product' AS kind, vp.public_id AS id, vp.product_title AS label
    FROM vendor_products vp
    UNION ALL
    SELECT 'category' AS kind, ca.id::text AS id, coalesce(ct_el.name, ct_en.name, ca.code) AS label
    FROM (SELECT DISTINCT id, parent_id, code, slug FROM category_ancestors) ca
    LEFT JOIN category_translations ct_el ON ct_el.category_id=ca.id AND ct_el.locale='el'
    LEFT JOIN category_translations ct_en ON ct_en.category_id=ca.id AND ct_en.locale='en'
    ORDER BY kind, label
  `, [vendorId]);

  const products: VendorAnalyticsOption[] = [];
  const categories: VendorAnalyticsOption[] = [];
  for (const row of options.rows) {
    const option = { id: String(row.id), label: String(row.label ?? row.id) };
    if (row.kind === "product") products.push(option); else categories.push(option);
  }

  const periodDays = Number.isSafeInteger(filters.periodDays) && Number(filters.periodDays) > 0 ? Number(filters.periodDays) : null;
  const fromDate = filters.fromDate?.trim() || null;
  const toDate = filters.toDate?.trim() || null;
  const categoryId = filters.categoryId?.trim() || null;
  const productId = filters.productId?.trim() || null;

  const result = await pool.query(`
    WITH RECURSIVE category_scope AS (
      SELECT id FROM categories WHERE id=$5::uuid
      UNION ALL
      SELECT c.id FROM categories c JOIN category_scope cs ON c.parent_id=cs.id
    ), vendor_products AS (
      SELECT cv.id, cv.public_id,
        coalesce(pt_el.title, pt_en.title, cv.model, cv.public_id) AS product_title,
        coalesce(cv.category_id, pf.category_id) AS category_id,
        coalesce(ct_el.name, ct_en.name, c.code, 'Χωρίς κατηγορία') AS category_name
      FROM canonical_variants cv
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
      LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
      LEFT JOIN categories c ON c.id=coalesce(cv.category_id, pf.category_id)
      LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
      LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
      WHERE EXISTS (SELECT 1 FROM vendor_offers vo WHERE vo.vendor_id=$1 AND vo.canonical_variant_id=cv.id)
        AND ($6::text IS NULL OR cv.public_id=$6)
        AND (
          $5::uuid IS NULL
          OR coalesce(cv.category_id, pf.category_id) IN (SELECT id FROM category_scope)
          OR EXISTS (
            SELECT 1 FROM canonical_variant_category_assignments ca
            WHERE ca.canonical_variant_id=cv.id AND ca.category_id IN (SELECT id FROM category_scope)
          )
        )
    ), fairness AS (
      SELECT fae.canonical_variant_id, count(*)::bigint AS impressions
      FROM fairness_assignment_events fae
      JOIN vendor_products vp ON vp.id=fae.canonical_variant_id
      WHERE fae.selected_vendor_id=$1
        AND (
          ($3::date IS NOT NULL AND fae.created_at >= ($3::date::timestamp AT TIME ZONE 'Europe/Athens'))
          OR ($3::date IS NULL AND ($2::int IS NULL OR fae.created_at >= now() - ($2::int * interval '1 day')))
        )
        AND ($4::date IS NULL OR fae.created_at < ((($4::date + 1)::timestamp) AT TIME ZONE 'Europe/Athens'))
      GROUP BY fae.canonical_variant_id
    ), event_rollup AS (
      SELECT pae.canonical_variant_id,
        count(*) FILTER (WHERE event_type='page_view')::bigint AS page_views,
        count(DISTINCT visitor_hash) FILTER (WHERE event_type='page_view' AND visitor_hash IS NOT NULL)::bigint AS unique_viewers,
        coalesce(sum(engaged_seconds) FILTER (WHERE event_type='engagement'),0)::bigint AS engaged_seconds,
        count(*) FILTER (WHERE event_type='add_to_cart')::bigint AS add_to_carts,
        count(*) FILTER (WHERE event_type='checkout_started')::bigint AS checkout_starts,
        count(*) FILTER (WHERE event_type='purchase')::bigint AS purchases,
        coalesce(sum(quantity) FILTER (WHERE event_type='purchase'),0)::bigint AS units_sold,
        coalesce(sum(amount_minor) FILTER (WHERE event_type='purchase'),0)::bigint AS revenue_minor
      FROM product_analytics_events pae
      JOIN vendor_products vp ON vp.id=pae.canonical_variant_id
      WHERE pae.vendor_id=$1
        AND (
          ($3::date IS NOT NULL AND pae.occurred_at >= ($3::date::timestamp AT TIME ZONE 'Europe/Athens'))
          OR ($3::date IS NULL AND ($2::int IS NULL OR pae.occurred_at >= now() - ($2::int * interval '1 day')))
        )
        AND ($4::date IS NULL OR pae.occurred_at < ((($4::date + 1)::timestamp) AT TIME ZONE 'Europe/Athens'))
      GROUP BY pae.canonical_variant_id
    )
    SELECT vp.public_id, vp.product_title, vp.category_id, vp.category_name,
      coalesce(f.impressions,0)::bigint AS impressions,
      coalesce(e.page_views,0)::bigint AS page_views,
      coalesce(e.unique_viewers,0)::bigint AS unique_viewers,
      coalesce(e.engaged_seconds,0)::bigint AS engaged_seconds,
      coalesce(e.add_to_carts,0)::bigint AS add_to_carts,
      coalesce(e.checkout_starts,0)::bigint AS checkout_starts,
      coalesce(e.purchases,0)::bigint AS purchases,
      coalesce(e.units_sold,0)::bigint AS units_sold,
      coalesce(e.revenue_minor,0)::bigint AS revenue_minor
    FROM vendor_products vp
    LEFT JOIN fairness f ON f.canonical_variant_id=vp.id
    LEFT JOIN event_rollup e ON e.canonical_variant_id=vp.id
    ORDER BY purchases DESC, page_views DESC, impressions DESC, product_title
  `, [vendorId, periodDays, fromDate, toDate, categoryId, productId]);

  const rows: VendorProductAnalyticsRow[] = result.rows.map((row) => ({
    canonicalVariantId: String(row.public_id),
    productTitle: String(row.product_title ?? row.public_id),
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryName: String(row.category_name ?? "Χωρίς κατηγορία"),
    impressions: safeNumber(row.impressions),
    pageViews: safeNumber(row.page_views),
    uniqueViewers: safeNumber(row.unique_viewers),
    engagedSeconds: safeNumber(row.engaged_seconds),
    addToCarts: safeNumber(row.add_to_carts),
    checkoutStarts: safeNumber(row.checkout_starts),
    purchases: safeNumber(row.purchases),
    unitsSold: safeNumber(row.units_sold),
    revenueMinor: safeNumber(row.revenue_minor)
  }));

  return { rows, products, categories, totals: totalRows(rows) };
}
