import {
  PostgresUnitOfWork,
  calculateCurrentCatalogueMargin,
  calculateProfitabilityLine,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type ProfitabilityPeriod = 30 | 90 | 365 | null;

export type ProfitabilitySummary = Readonly<{
  realizedRevenueMinor: number;
  coveredRevenueMinor: number;
  realizedCostMinor: number;
  grossProfitMinor: number;
  contributionAfterMarketplaceFeesMinor: number;
  vendorFundedDiscountMinor: number;
  recognizedUnits: number;
  recognizedLines: number;
  costCoveredLines: number;
  missingCostLines: number;
  costCoveragePct: number;
  grossMarginBps?: number;
  contributionMarginBps?: number;
}>;

export type ProfitabilityBreakdownRow = Readonly<{
  id: string;
  label: string;
  secondaryLabel?: string;
  revenueMinor: number;
  coveredRevenueMinor: number;
  costMinor: number;
  grossProfitMinor: number;
  contributionMinor: number;
  recognizedUnits: number;
  coveredLines: number;
  missingCostLines: number;
  grossMarginBps?: number;
  contributionMarginBps?: number;
}>;

export type CurrentMarginRow = Readonly<{
  vendorId?: string;
  vendorName?: string;
  offerId: string;
  productId: string;
  productTitle: string;
  categoryCode?: string;
  categoryName: string;
  retailPriceMinor: number;
  buyingPriceMinor?: number;
  grossProfitMinor?: number;
  grossMarginBps?: number;
  status: "missing_cost" | "negative" | "thin" | "healthy";
}>;

export type CurrentMarginSummary = Readonly<{
  offers: number;
  costCoveredOffers: number;
  missingCostOffers: number;
  negativeMarginOffers: number;
  thinMarginOffers: number;
  healthyMarginOffers: number;
  coveragePct: number;
  coveredRetailMinor: number;
  coveredCostMinor: number;
  coveredGrossProfitMinor: number;
  coveredGrossMarginBps?: number;
}>;

export type ProfitabilityReport = Readonly<{
  periodDays: ProfitabilityPeriod;
  summary: ProfitabilitySummary;
  current: CurrentMarginSummary;
  currentRows: readonly CurrentMarginRow[];
  products: readonly ProfitabilityBreakdownRow[];
  categories: readonly ProfitabilityBreakdownRow[];
}>;

export type AdminProfitabilityReport = ProfitabilityReport & Readonly<{
  vendors: readonly ProfitabilityBreakdownRow[];
}>;

type HistoricalSourceRow = Readonly<{
  vendor_id?: unknown;
  vendor_name?: unknown;
  product_id: unknown;
  product_title: unknown;
  category_code?: unknown;
  category_name?: unknown;
  ordered_quantity: unknown;
  fulfilled_quantity: unknown;
  refunded_quantity: unknown;
  retail_unit_price_minor: unknown;
  vendor_proceeds_minor: unknown;
  buying_unit_price_minor?: unknown;
  adjustment_refunded_minor: unknown;
  vendor_discount_minor: unknown;
  coupon_vendor_funding_minor: unknown;
}>;

type CurrentSourceRow = Readonly<{
  vendor_id?: unknown;
  vendor_name?: unknown;
  offer_id: unknown;
  product_id: unknown;
  product_title: unknown;
  category_code?: unknown;
  category_name?: unknown;
  retail_price_minor: unknown;
  buying_price_minor?: unknown;
  offer_status?: unknown;
}>;

function safeInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function optionalSafeInteger(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function marginBps(profitMinor: number, revenueMinor: number): number | undefined {
  return revenueMinor > 0 ? Math.round((profitMinor * 10_000) / revenueMinor) : undefined;
}

function emptySummary(): ProfitabilitySummary {
  return {
    realizedRevenueMinor: 0,
    coveredRevenueMinor: 0,
    realizedCostMinor: 0,
    grossProfitMinor: 0,
    contributionAfterMarketplaceFeesMinor: 0,
    vendorFundedDiscountMinor: 0,
    recognizedUnits: 0,
    recognizedLines: 0,
    costCoveredLines: 0,
    missingCostLines: 0,
    costCoveragePct: 0
  };
}

function historicalSummary(rows: readonly HistoricalSourceRow[]): ProfitabilitySummary {
  let summary = emptySummary();
  for (const row of rows) {
    const line = calculateProfitabilityLine({
      orderedQuantity: safeInteger(row.ordered_quantity),
      fulfilledQuantity: safeInteger(row.fulfilled_quantity),
      refundedQuantity: safeInteger(row.refunded_quantity),
      retailUnitPriceMinor: safeInteger(row.retail_unit_price_minor),
      vendorProceedsMinor: safeInteger(row.vendor_proceeds_minor),
      buyingUnitPriceMinor: optionalSafeInteger(row.buying_unit_price_minor),
      adjustmentRefundedMinor: safeInteger(row.adjustment_refunded_minor),
      vendorDiscountMinor: safeInteger(row.vendor_discount_minor),
      couponVendorFundingMinor: safeInteger(row.coupon_vendor_funding_minor)
    });
    if (line.recognizedQuantity <= 0) continue;
    const covered = line.costCovered;
    summary = {
      ...summary,
      realizedRevenueMinor: summary.realizedRevenueMinor + line.realizedRevenueMinor,
      coveredRevenueMinor: summary.coveredRevenueMinor + (covered ? line.realizedRevenueMinor : 0),
      realizedCostMinor: summary.realizedCostMinor + (line.realizedCostMinor ?? 0),
      grossProfitMinor: summary.grossProfitMinor + (line.grossProfitMinor ?? 0),
      contributionAfterMarketplaceFeesMinor: summary.contributionAfterMarketplaceFeesMinor + (line.contributionAfterMarketplaceFeesMinor ?? 0),
      vendorFundedDiscountMinor: summary.vendorFundedDiscountMinor + line.vendorFundedDiscountMinor,
      recognizedUnits: summary.recognizedUnits + line.recognizedQuantity,
      recognizedLines: summary.recognizedLines + 1,
      costCoveredLines: summary.costCoveredLines + (covered ? 1 : 0),
      missingCostLines: summary.missingCostLines + (covered ? 0 : 1)
    };
  }
  const coveragePct = summary.recognizedLines ? (summary.costCoveredLines / summary.recognizedLines) * 100 : 0;
  return {
    ...summary,
    costCoveragePct: coveragePct,
    grossMarginBps: marginBps(summary.grossProfitMinor, summary.coveredRevenueMinor),
    contributionMarginBps: marginBps(summary.contributionAfterMarketplaceFeesMinor, summary.coveredRevenueMinor)
  };
}

function breakdown(
  rows: readonly HistoricalSourceRow[],
  key: (row: HistoricalSourceRow) => string,
  label: (row: HistoricalSourceRow) => string,
  secondary?: (row: HistoricalSourceRow) => string | undefined
): ProfitabilityBreakdownRow[] {
  const groups = new Map<string, { label: string; secondaryLabel?: string; rows: HistoricalSourceRow[] }>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id) ?? { label: label(row), secondaryLabel: secondary?.(row), rows: [] };
    group.rows.push(row);
    groups.set(id, group);
  }
  return [...groups.entries()].map(([id, group]) => {
    const s = historicalSummary(group.rows);
    return {
      id,
      label: group.label,
      secondaryLabel: group.secondaryLabel,
      revenueMinor: s.realizedRevenueMinor,
      coveredRevenueMinor: s.coveredRevenueMinor,
      costMinor: s.realizedCostMinor,
      grossProfitMinor: s.grossProfitMinor,
      contributionMinor: s.contributionAfterMarketplaceFeesMinor,
      recognizedUnits: s.recognizedUnits,
      coveredLines: s.costCoveredLines,
      missingCostLines: s.missingCostLines,
      grossMarginBps: s.grossMarginBps,
      contributionMarginBps: s.contributionMarginBps
    };
  }).sort((a, b) => b.grossProfitMinor - a.grossProfitMinor || b.revenueMinor - a.revenueMinor);
}

function currentMarginRows(rows: readonly CurrentSourceRow[]): CurrentMarginRow[] {
  return rows
    .filter((row) => String(row.offer_status ?? "approved") === "approved")
    .map((row) => {
      const margin = calculateCurrentCatalogueMargin({
        retailPriceMinor: safeInteger(row.retail_price_minor),
        buyingPriceMinor: optionalSafeInteger(row.buying_price_minor)
      });
      return {
        vendorId: row.vendor_id ? String(row.vendor_id) : undefined,
        vendorName: row.vendor_name ? String(row.vendor_name) : undefined,
        offerId: String(row.offer_id),
        productId: String(row.product_id),
        productTitle: String(row.product_title ?? row.product_id),
        categoryCode: row.category_code ? String(row.category_code) : undefined,
        categoryName: String(row.category_name ?? "Χωρίς κατηγορία"),
        ...margin
      };
    });
}

function currentSummary(rows: readonly CurrentMarginRow[]): CurrentMarginSummary {
  const covered = rows.filter((row) => row.buyingPriceMinor !== undefined);
  const coveredRetailMinor = covered.reduce((sum, row) => sum + row.retailPriceMinor, 0);
  const coveredCostMinor = covered.reduce((sum, row) => sum + (row.buyingPriceMinor ?? 0), 0);
  const coveredGrossProfitMinor = covered.reduce((sum, row) => sum + (row.grossProfitMinor ?? 0), 0);
  return {
    offers: rows.length,
    costCoveredOffers: covered.length,
    missingCostOffers: rows.length - covered.length,
    negativeMarginOffers: rows.filter((row) => row.status === "negative").length,
    thinMarginOffers: rows.filter((row) => row.status === "thin").length,
    healthyMarginOffers: rows.filter((row) => row.status === "healthy").length,
    coveragePct: rows.length ? (covered.length / rows.length) * 100 : 0,
    coveredRetailMinor,
    coveredCostMinor,
    coveredGrossProfitMinor,
    coveredGrossMarginBps: marginBps(coveredGrossProfitMinor, coveredRetailMinor)
  };
}

function periodStart(periodDays: ProfitabilityPeriod): Date | null {
  if (!periodDays) return null;
  return new Date(Date.now() - periodDays * 86_400_000);
}

function vendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function unitOfWork() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 20_000, lockTimeoutMs: 5_000 });
}

function reportFromRows(periodDays: ProfitabilityPeriod, historical: HistoricalSourceRow[], currentSource: CurrentSourceRow[]): ProfitabilityReport {
  const currentRows = currentMarginRows(currentSource);
  return {
    periodDays,
    summary: historicalSummary(historical),
    current: currentSummary(currentRows),
    currentRows: [...currentRows].sort((a, b) => {
      const rank = { negative: 0, missing_cost: 1, thin: 2, healthy: 3 } as const;
      return rank[a.status] - rank[b.status] || (a.grossMarginBps ?? -Infinity) - (b.grossMarginBps ?? -Infinity);
    }),
    products: breakdown(historical, (row) => String(row.product_id), (row) => String(row.product_title ?? row.product_id), (row) => String(row.category_name ?? "Χωρίς κατηγορία")),
    categories: breakdown(historical, (row) => String(row.category_code ?? "uncategorised"), (row) => String(row.category_name ?? row.category_code ?? "Χωρίς κατηγορία"))
  };
}

export async function vendorProfitabilityIntelligence(principal: SessionPrincipal, periodDays: ProfitabilityPeriod = 90): Promise<ProfitabilityReport> {
  if (!productionDatabaseConfigured()) return reportFromRows(periodDays, [], []);
  const identity = vendorId(principal);
  const start = periodStart(periodDays)?.toISOString() ?? null;
  return unitOfWork().withTransaction(
    { actorUserId: principal.userId, vendorId: identity, marketId: "sparta" },
    async (tx) => {
      const vendor = await tx.query<SqlRow>(`SELECT id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [identity]);
      if (vendor.rowCount !== 1) return reportFromRows(periodDays, [], []);
      const vendorUuid = String(vendor.rows[0].id);
      const [history, current] = await Promise.all([
        tx.query<SqlRow>(`
          SELECT cv.public_id AS product_id,
            coalesce(pt_el.title,pt_en.title,cv.model,cv.public_id) AS product_title,
            c.code AS category_code,
            coalesce(ct_el.name,ct_en.name,c.code,'Χωρίς κατηγορία') AS category_name,
            ol.quantity AS ordered_quantity,ol.fulfilled_quantity,ol.refunded_quantity,
            ol.retail_unit_price_minor,ol.vendor_proceeds_minor,ps.buying_unit_price_minor,
            ol.adjustment_refunded_minor,ol.vendor_discount_minor,ol.coupon_vendor_funding_minor
          FROM order_lines ol
          JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
          LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
          LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
          LEFT JOIN product_families pf ON pf.id=cv.family_id
          LEFT JOIN categories c ON c.id=coalesce(cv.category_id,pf.category_id)
          LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
          LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
          LEFT JOIN order_line_profitability_private ps ON ps.order_line_id=ol.id
          WHERE ol.vendor_id=$1::uuid AND ($2::timestamptz IS NULL OR ol.created_at >= $2::timestamptz)
          ORDER BY ol.created_at DESC
        `, [vendorUuid, start]),
        tx.query<SqlRow>(`
          SELECT vo.public_id AS offer_id,cv.public_id AS product_id,
            coalesce(pt_el.title,pt_en.title,cv.model,cv.public_id) AS product_title,
            c.code AS category_code,
            coalesce(ct_el.name,ct_en.name,c.code,'Χωρίς κατηγορία') AS category_name,
            vo.customer_price_minor AS retail_price_minor,p.buying_price_minor,vo.status::text AS offer_status
          FROM vendor_offers vo
          JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
          LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
          LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
          LEFT JOIN product_families pf ON pf.id=cv.family_id
          LEFT JOIN categories c ON c.id=coalesce(cv.category_id,pf.category_id)
          LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
          LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
          LEFT JOIN vendor_offer_pricing_private p ON p.offer_id=vo.id
          WHERE vo.vendor_id=$1::uuid AND vo.customer_price_minor IS NOT NULL
          ORDER BY product_title,vo.public_id
        `, [vendorUuid])
      ]);
      return reportFromRows(periodDays, history.rows as HistoricalSourceRow[], current.rows as CurrentSourceRow[]);
    },
    { readOnly: true }
  );
}

export async function adminProfitabilityIntelligence(principal: SessionPrincipal, periodDays: ProfitabilityPeriod = 90): Promise<AdminProfitabilityReport> {
  if (!principal.roles.some((role) => role.startsWith("admin_"))) throw new Error("ADMIN_AUTH_REQUIRED");
  if (!productionDatabaseConfigured()) return { ...reportFromRows(periodDays, [], []), vendors: [] };
  const pool = getProductionPostgresRuntime().nativePool;
  const start = periodStart(periodDays)?.toISOString() ?? null;
  const [history, current] = await Promise.all([
    pool.query(`SELECT * FROM bls_private.admin_profitability_lines($1::timestamptz,NULL)`, [start]),
    pool.query(`SELECT * FROM bls_private.admin_current_catalogue_margin()`)
  ]);
  const historical = history.rows as HistoricalSourceRow[];
  const base = reportFromRows(periodDays, historical, current.rows as CurrentSourceRow[]);
  return {
    ...base,
    vendors: breakdown(historical, (row) => String(row.vendor_id ?? "unknown"), (row) => String(row.vendor_name ?? row.vendor_id ?? "Unknown vendor"))
  };
}
