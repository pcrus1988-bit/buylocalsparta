import {
  PostgresUnitOfWork,
  formatMoney,
  money,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

export type AdminAnalyticsFilters = Readonly<{
  from: string;
  to: string;
  vendorId?: string;
  categoryCode?: string;
}>;

export type AdminAnalyticsVendorRow = Readonly<{
  vendorId: string;
  vendorName: string;
  activeProducts: number;
  impressions: number;
  productViews: number;
  uniqueViewers: number;
  engagedSeconds: number;
  averageEngagedSeconds: number;
  cartAdds: number;
  checkoutStarts: number;
  attributedOrders: number;
  unitsSold: number;
  revenueMinor: number;
  revenue: string;
  viewRate: number;
  cartRate: number;
  conversionRate: number;
}>;

export type AdminAnalyticsProductRow = Readonly<{
  canonicalVariantId: string;
  productTitle: string;
  categoryCode: string;
  categoryName: string;
  impressions: number;
  productViews: number;
  uniqueViewers: number;
  engagedSeconds: number;
  averageEngagedSeconds: number;
  cartAdds: number;
  checkoutStarts: number;
  attributedOrders: number;
  unitsSold: number;
  revenueMinor: number;
  revenue: string;
  conversionRate: number;
}>;

export type AdminVendorAnalyticsReport = Readonly<{
  filters: AdminAnalyticsFilters;
  generatedAt: number;
  vendors: readonly Readonly<{ id: string; name: string }>[];
  categories: readonly Readonly<{ code: string; label: string; depth: number }>[];
  rows: readonly AdminAnalyticsVendorRow[];
  products: readonly AdminAnalyticsProductRow[];
  summary: Readonly<{
    vendorCount: number;
    activeProducts: number;
    impressions: number;
    productViews: number;
    uniqueViewers: number;
    engagedSeconds: number;
    cartAdds: number;
    checkoutStarts: number;
    attributedOrders: number;
    unitsSold: number;
    revenueMinor: number;
    revenue: string;
    viewRate: number;
    cartRate: number;
    conversionRate: number;
  }>;
}>;

function dateOnly(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized ? normalized : undefined;
}

function optionalFilter(value: string | undefined): string | undefined {
  const normalized = value?.trim().slice(0, 180);
  return normalized || undefined;
}

function utcDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function normalizeAdminAnalyticsFilters(
  input: Readonly<{ from?: string; to?: string; vendorId?: string; categoryCode?: string }>,
  now = Date.now()
): AdminAnalyticsFilters {
  const defaultTo = utcDate(now);
  const defaultFrom = utcDate(now - 29 * DAY_MS);
  const from = dateOnly(input.from) ?? defaultFrom;
  const to = dateOnly(input.to) ?? defaultTo;
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
  if (fromMs > toMs) throw new Error("The report start date must be on or before the end date");
  if (((toMs - fromMs) / DAY_MS) + 1 > MAX_RANGE_DAYS) throw new Error(`Analytics reports are limited to ${MAX_RANGE_DAYS} days`);
  return {
    from,
    to,
    vendorId: optionalFilter(input.vendorId),
    categoryCode: optionalFilter(input.categoryCode)
  };
}

function safeInteger(value: unknown, field: string): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid analytics integer: ${field}`);
  return parsed;
}

function safeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function fromTimestamp(filters: AdminAnalyticsFilters): Date {
  return new Date(`${filters.from}T00:00:00.000Z`);
}

function toExclusiveTimestamp(filters: AdminAnalyticsFilters): Date {
  return new Date(new Date(`${filters.to}T00:00:00.000Z`).getTime() + DAY_MS);
}

const CATEGORY_SCOPE_CTE = `
  category_scope AS (
    SELECT c.id
    FROM categories c
    WHERE c.market_id=(SELECT id FROM markets WHERE code='sparta')
      AND $4::text<>''
      AND c.code=$4
    UNION ALL
    SELECT child.id
    FROM categories child
    JOIN category_scope parent ON child.parent_id=parent.id
  )`;

export async function adminVendorAnalyticsReport(
  principal: SessionPrincipal,
  filters: AdminAnalyticsFilters
): Promise<AdminVendorAnalyticsReport> {
  assertAdminPermission(principal, "analytics.market.read");
  if (!productionDatabaseConfigured()) throw new Error("Vendor analytics reports require the production database");

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const params = [filters.vendorId ?? "", fromTimestamp(filters), toExclusiveTimestamp(filters), filters.categoryCode ?? ""] as const;

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [vendorOptions, categoryOptions, vendorRows] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT vb.public_id, COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id) AS name
        FROM vendor_businesses vb
        WHERE vb.market_id=(SELECT id FROM markets WHERE code='sparta')
        ORDER BY lower(COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id)),vb.public_id
      `),
      tx.query<SqlRow>(`
        WITH RECURSIVE tree AS (
          SELECT c.id,c.parent_id,c.code,0 AS depth,
                 COALESCE(el.name,en.name,c.code) AS name,
                 ARRAY[COALESCE(el.name,en.name,c.code)]::text[] AS path
          FROM categories c
          LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'
          LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'
          WHERE c.market_id=(SELECT id FROM markets WHERE code='sparta') AND c.parent_id IS NULL AND c.active=true
          UNION ALL
          SELECT c.id,c.parent_id,c.code,t.depth+1,
                 COALESCE(el.name,en.name,c.code) AS name,
                 t.path || COALESCE(el.name,en.name,c.code)
          FROM categories c
          JOIN tree t ON c.parent_id=t.id
          LEFT JOIN category_translations el ON el.category_id=c.id AND el.locale='el'
          LEFT JOIN category_translations en ON en.category_id=c.id AND en.locale='en'
          WHERE c.active=true
        )
        SELECT code,name,depth,path FROM tree ORDER BY path
      `),
      tx.query<SqlRow>(`
        WITH RECURSIVE ${CATEGORY_SCOPE_CTE},
        vendor_base AS (
          SELECT vb.id,vb.public_id,COALESCE(NULLIF(vb.trading_name,''),vb.legal_name,vb.public_id) AS vendor_name
          FROM vendor_businesses vb
          WHERE vb.market_id=(SELECT id FROM markets WHERE code='sparta')
            AND ($1::text='' OR vb.public_id=$1)
        ),
        catalog AS (
          SELECT vo.vendor_id,count(DISTINCT vo.canonical_variant_id)::bigint AS active_products
          FROM vendor_offers vo
          JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
          WHERE vo.status='approved'
            AND ($1::text='' OR vo.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1))
            AND ($4::text='' OR cv.category_id IN (SELECT id FROM category_scope))
          GROUP BY vo.vendor_id
        ),
        fairness AS (
          SELECT fa.selected_vendor_id AS vendor_id,count(*)::bigint AS impressions
          FROM fairness_assignment_events fa
          JOIN canonical_variants cv ON cv.id=fa.canonical_variant_id
          WHERE fa.market_id=(SELECT id FROM markets WHERE code='sparta')
            AND fa.created_at >= $2 AND fa.created_at < $3
            AND ($1::text='' OR fa.selected_vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1))
            AND ($4::text='' OR cv.category_id IN (SELECT id FROM category_scope))
          GROUP BY fa.selected_vendor_id
        ),
        event_rollup AS (
          SELECT pae.vendor_id,
                 count(*) FILTER (WHERE pae.event_type='page_view')::bigint AS product_views,
                 count(DISTINCT pae.visitor_hash) FILTER (WHERE pae.event_type='page_view' AND pae.visitor_hash IS NOT NULL)::bigint AS unique_viewers,
                 COALESCE(sum(pae.engaged_seconds) FILTER (WHERE pae.event_type='engagement'),0)::bigint AS engaged_seconds,
                 count(*) FILTER (WHERE pae.event_type='add_to_cart')::bigint AS cart_adds,
                 count(*) FILTER (WHERE pae.event_type='checkout_started')::bigint AS checkout_starts,
                 count(DISTINCT pae.order_id) FILTER (WHERE pae.event_type='purchase' AND pae.order_id IS NOT NULL)::bigint AS attributed_orders,
                 COALESCE(sum(pae.quantity) FILTER (WHERE pae.event_type='purchase'),0)::bigint AS units_sold,
                 COALESCE(sum(pae.amount_minor) FILTER (WHERE pae.event_type='purchase'),0)::bigint AS revenue_minor
          FROM product_analytics_events pae
          JOIN canonical_variants cv ON cv.id=pae.canonical_variant_id
          WHERE pae.occurred_at >= $2 AND pae.occurred_at < $3
            AND ($1::text='' OR pae.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1))
            AND ($4::text='' OR cv.category_id IN (SELECT id FROM category_scope))
          GROUP BY pae.vendor_id
        )
        SELECT vb.public_id,vb.vendor_name,
               COALESCE(c.active_products,0)::bigint AS active_products,
               COALESCE(f.impressions,0)::bigint AS impressions,
               COALESCE(e.product_views,0)::bigint AS product_views,
               COALESCE(e.unique_viewers,0)::bigint AS unique_viewers,
               COALESCE(e.engaged_seconds,0)::bigint AS engaged_seconds,
               COALESCE(e.cart_adds,0)::bigint AS cart_adds,
               COALESCE(e.checkout_starts,0)::bigint AS checkout_starts,
               COALESCE(e.attributed_orders,0)::bigint AS attributed_orders,
               COALESCE(e.units_sold,0)::bigint AS units_sold,
               COALESCE(e.revenue_minor,0)::bigint AS revenue_minor
        FROM vendor_base vb
        LEFT JOIN catalog c ON c.vendor_id=vb.id
        LEFT JOIN fairness f ON f.vendor_id=vb.id
        LEFT JOIN event_rollup e ON e.vendor_id=vb.id
        ORDER BY COALESCE(e.revenue_minor,0) DESC,COALESCE(e.attributed_orders,0) DESC,COALESCE(e.product_views,0) DESC,lower(vb.vendor_name)
      `, params)
    ]);

    const rows: AdminAnalyticsVendorRow[] = vendorRows.rows.map((row) => {
      const impressions = safeInteger(row.impressions, "impressions");
      const productViews = safeInteger(row.product_views, "product_views");
      const uniqueViewers = safeInteger(row.unique_viewers, "unique_viewers");
      const engagedSeconds = safeInteger(row.engaged_seconds, "engaged_seconds");
      const cartAdds = safeInteger(row.cart_adds, "cart_adds");
      const attributedOrders = safeInteger(row.attributed_orders, "attributed_orders");
      const revenueMinor = safeInteger(row.revenue_minor, "revenue_minor");
      return {
        vendorId: safeText(row.public_id),
        vendorName: safeText(row.vendor_name, safeText(row.public_id)),
        activeProducts: safeInteger(row.active_products, "active_products"),
        impressions,
        productViews,
        uniqueViewers,
        engagedSeconds,
        averageEngagedSeconds: uniqueViewers ? Math.round(engagedSeconds / uniqueViewers) : 0,
        cartAdds,
        checkoutStarts: safeInteger(row.checkout_starts, "checkout_starts"),
        attributedOrders,
        unitsSold: safeInteger(row.units_sold, "units_sold"),
        revenueMinor,
        revenue: formatMoney(money(revenueMinor)),
        viewRate: rate(productViews, impressions),
        cartRate: rate(cartAdds, productViews),
        conversionRate: rate(attributedOrders, productViews)
      };
    });

    let products: AdminAnalyticsProductRow[] = [];
    if (filters.vendorId) {
      const productRows = await tx.query<SqlRow>(`
        WITH RECURSIVE ${CATEGORY_SCOPE_CTE},
        product_base AS (
          SELECT DISTINCT cv.id,cv.public_id,cv.category_id,
                 COALESCE(pt_el.title,pt_en.title,cv.model,cv.public_id) AS product_title,
                 c.code AS category_code,COALESCE(ct_el.name,ct_en.name,c.code) AS category_name
          FROM vendor_offers vo
          JOIN vendor_businesses vb ON vb.id=vo.vendor_id
          JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
          JOIN categories c ON c.id=cv.category_id
          LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
          LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
          LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
          LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
          WHERE vb.public_id=$1 AND vo.status='approved'
            AND ($4::text='' OR cv.category_id IN (SELECT id FROM category_scope))
        ),
        fairness AS (
          SELECT fa.canonical_variant_id,count(*)::bigint AS impressions
          FROM fairness_assignment_events fa
          JOIN vendor_businesses vb ON vb.id=fa.selected_vendor_id
          JOIN canonical_variants cv ON cv.id=fa.canonical_variant_id
          WHERE vb.public_id=$1 AND fa.created_at >= $2 AND fa.created_at < $3
            AND ($4::text='' OR cv.category_id IN (SELECT id FROM category_scope))
          GROUP BY fa.canonical_variant_id
        ),
        event_rollup AS (
          SELECT pae.canonical_variant_id,
                 count(*) FILTER (WHERE pae.event_type='page_view')::bigint AS product_views,
                 count(DISTINCT pae.visitor_hash) FILTER (WHERE pae.event_type='page_view' AND pae.visitor_hash IS NOT NULL)::bigint AS unique_viewers,
                 COALESCE(sum(pae.engaged_seconds) FILTER (WHERE pae.event_type='engagement'),0)::bigint AS engaged_seconds,
                 count(*) FILTER (WHERE pae.event_type='add_to_cart')::bigint AS cart_adds,
                 count(*) FILTER (WHERE pae.event_type='checkout_started')::bigint AS checkout_starts,
                 count(DISTINCT pae.order_id) FILTER (WHERE pae.event_type='purchase' AND pae.order_id IS NOT NULL)::bigint AS attributed_orders,
                 COALESCE(sum(pae.quantity) FILTER (WHERE pae.event_type='purchase'),0)::bigint AS units_sold,
                 COALESCE(sum(pae.amount_minor) FILTER (WHERE pae.event_type='purchase'),0)::bigint AS revenue_minor
          FROM product_analytics_events pae
          JOIN vendor_businesses vb ON vb.id=pae.vendor_id
          JOIN canonical_variants cv ON cv.id=pae.canonical_variant_id
          WHERE vb.public_id=$1 AND pae.occurred_at >= $2 AND pae.occurred_at < $3
            AND ($4::text='' OR cv.category_id IN (SELECT id FROM category_scope))
          GROUP BY pae.canonical_variant_id
        )
        SELECT pb.public_id,pb.product_title,pb.category_code,pb.category_name,
               COALESCE(f.impressions,0)::bigint AS impressions,
               COALESCE(e.product_views,0)::bigint AS product_views,
               COALESCE(e.unique_viewers,0)::bigint AS unique_viewers,
               COALESCE(e.engaged_seconds,0)::bigint AS engaged_seconds,
               COALESCE(e.cart_adds,0)::bigint AS cart_adds,
               COALESCE(e.checkout_starts,0)::bigint AS checkout_starts,
               COALESCE(e.attributed_orders,0)::bigint AS attributed_orders,
               COALESCE(e.units_sold,0)::bigint AS units_sold,
               COALESCE(e.revenue_minor,0)::bigint AS revenue_minor
        FROM product_base pb
        LEFT JOIN fairness f ON f.canonical_variant_id=pb.id
        LEFT JOIN event_rollup e ON e.canonical_variant_id=pb.id
        ORDER BY COALESCE(e.revenue_minor,0) DESC,COALESCE(e.product_views,0) DESC,pb.product_title
      `, params);
      products = productRows.rows.map((row) => {
        const productViews = safeInteger(row.product_views, "product_views");
        const uniqueViewers = safeInteger(row.unique_viewers, "unique_viewers");
        const engagedSeconds = safeInteger(row.engaged_seconds, "engaged_seconds");
        const attributedOrders = safeInteger(row.attributed_orders, "attributed_orders");
        const revenueMinor = safeInteger(row.revenue_minor, "revenue_minor");
        return {
          canonicalVariantId: safeText(row.public_id),
          productTitle: safeText(row.product_title, safeText(row.public_id)),
          categoryCode: safeText(row.category_code),
          categoryName: safeText(row.category_name, safeText(row.category_code)),
          impressions: safeInteger(row.impressions, "impressions"),
          productViews,
          uniqueViewers,
          engagedSeconds,
          averageEngagedSeconds: uniqueViewers ? Math.round(engagedSeconds / uniqueViewers) : 0,
          cartAdds: safeInteger(row.cart_adds, "cart_adds"),
          checkoutStarts: safeInteger(row.checkout_starts, "checkout_starts"),
          attributedOrders,
          unitsSold: safeInteger(row.units_sold, "units_sold"),
          revenueMinor,
          revenue: formatMoney(money(revenueMinor)),
          conversionRate: rate(attributedOrders, productViews)
        };
      });
    }

    const summaryNumbers = rows.reduce((sum, row) => ({
      activeProducts: sum.activeProducts + row.activeProducts,
      impressions: sum.impressions + row.impressions,
      productViews: sum.productViews + row.productViews,
      uniqueViewers: sum.uniqueViewers + row.uniqueViewers,
      engagedSeconds: sum.engagedSeconds + row.engagedSeconds,
      cartAdds: sum.cartAdds + row.cartAdds,
      checkoutStarts: sum.checkoutStarts + row.checkoutStarts,
      attributedOrders: sum.attributedOrders + row.attributedOrders,
      unitsSold: sum.unitsSold + row.unitsSold,
      revenueMinor: sum.revenueMinor + row.revenueMinor
    }), { activeProducts: 0, impressions: 0, productViews: 0, uniqueViewers: 0, engagedSeconds: 0, cartAdds: 0, checkoutStarts: 0, attributedOrders: 0, unitsSold: 0, revenueMinor: 0 });

    return {
      filters,
      generatedAt: Date.now(),
      vendors: vendorOptions.rows.map((row) => ({ id: safeText(row.public_id), name: safeText(row.name, safeText(row.public_id)) })),
      categories: categoryOptions.rows.map((row) => ({ code: safeText(row.code), label: safeText(row.name, safeText(row.code)), depth: safeInteger(row.depth, "category_depth") })),
      rows,
      products,
      summary: {
        vendorCount: rows.length,
        ...summaryNumbers,
        revenue: formatMoney(money(summaryNumbers.revenueMinor)),
        viewRate: rate(summaryNumbers.productViews, summaryNumbers.impressions),
        cartRate: rate(summaryNumbers.cartAdds, summaryNumbers.productViews),
        conversionRate: rate(summaryNumbers.attributedOrders, summaryNumbers.productViews)
      }
    };
  }, { readOnly: true });
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvLine(values: readonly (string | number)[]): string {
  return values.map(csvCell).join(",");
}

export function vendorAnalyticsReportCsv(report: AdminVendorAnalyticsReport): string {
  const lines: string[] = [];
  lines.push(csvLine(["Buy Local Sparta vendor analytics report"]));
  lines.push(csvLine(["From", report.filters.from, "To", report.filters.to, "Vendor", report.filters.vendorId ?? "All", "Category", report.filters.categoryCode ?? "All"]));
  lines.push(csvLine(["Generated at", new Date(report.generatedAt).toISOString()]));
  lines.push("");
  lines.push(csvLine(["Vendor ID","Vendor","Active products","Impressions","Product views","Unique viewers","Engaged seconds","Avg engaged seconds","Cart adds","Checkout starts","Attributed orders","Units sold","Revenue EUR","View rate %","Cart rate %","Conversion rate %"]));
  for (const row of report.rows) {
    lines.push(csvLine([
      row.vendorId,row.vendorName,row.activeProducts,row.impressions,row.productViews,row.uniqueViewers,row.engagedSeconds,row.averageEngagedSeconds,
      row.cartAdds,row.checkoutStarts,row.attributedOrders,row.unitsSold,(row.revenueMinor / 100).toFixed(2),
      (row.viewRate * 100).toFixed(2),(row.cartRate * 100).toFixed(2),(row.conversionRate * 100).toFixed(2)
    ]));
  }
  if (report.products.length) {
    lines.push("");
    lines.push(csvLine(["Product ID","Product","Category code","Category","Impressions","Product views","Unique viewers","Engaged seconds","Avg engaged seconds","Cart adds","Checkout starts","Attributed orders","Units sold","Revenue EUR","Conversion rate %"]));
    for (const row of report.products) {
      lines.push(csvLine([
        row.canonicalVariantId,row.productTitle,row.categoryCode,row.categoryName,row.impressions,row.productViews,row.uniqueViewers,row.engagedSeconds,row.averageEngagedSeconds,
        row.cartAdds,row.checkoutStarts,row.attributedOrders,row.unitsSold,(row.revenueMinor / 100).toFixed(2),(row.conversionRate * 100).toFixed(2)
      ]));
    }
  }
  return lines.join("\r\n");
}
