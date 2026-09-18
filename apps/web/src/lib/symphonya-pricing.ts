export type SymphonyaPricingConfig = Readonly<{
  markupRate: number;
  minimumProfitMinor: number;
  transactionRate: number;
}>;

export type SymphonyaPricingRecommendation = Readonly<{
  sellingPriceMinor: number | null;
  markupPercent: number | null;
  profitMinor: number | null;
  profitPercent: number | null;
  supplierCostMinor: number | null;
  rule: string;
}>;

/**
 * Symphonya wholesale prices are treated as procurement cash cost. We deliberately
 * do not invent VAT or freight semantics here: checkout/shipping remains a separate
 * charge and tax presentation remains governed by vendor_offers.tax_rate_bps.
 *
 * The engine therefore guarantees two commercial floors:
 * 1. percentage uplift over supplier cost;
 * 2. minimum contribution after payment transaction cost.
 *
 * Environment overrides can tune both floors without changing supplier evidence.
 */
export const SYMPHONYA_DEFAULT_PRICING: SymphonyaPricingConfig = Object.freeze({
  markupRate: 0.35,
  minimumProfitMinor: 490,
  transactionRate: 0.025
});

export function symphonyaPricingConfig(env: NodeJS.ProcessEnv = process.env): SymphonyaPricingConfig {
  return {
    markupRate: nonNegativeRate(env.BLS_SYMPHONYA_MARKUP_RATE, SYMPHONYA_DEFAULT_PRICING.markupRate),
    minimumProfitMinor: nonNegativeInteger(
      env.BLS_SYMPHONYA_MINIMUM_PROFIT_MINOR,
      SYMPHONYA_DEFAULT_PRICING.minimumProfitMinor
    ),
    transactionRate: boundedRate(
      env.BLS_SYMPHONYA_TRANSACTION_RATE,
      SYMPHONYA_DEFAULT_PRICING.transactionRate
    )
  };
}

export function calculateSymphonyaRetailPrice(
  supplierCostMinor: number | null | undefined,
  config: SymphonyaPricingConfig = SYMPHONYA_DEFAULT_PRICING
): SymphonyaPricingRecommendation {
  const cost = validPositiveMinor(supplierCostMinor) ? supplierCostMinor : null;
  const unavailable: SymphonyaPricingRecommendation = {
    sellingPriceMinor: null,
    markupPercent: null,
    profitMinor: null,
    profitPercent: null,
    supplierCostMinor: cost,
    rule: "sym_v1_markup_and_min_contribution"
  };
  if (cost === null) return unavailable;
  if (
    !Number.isFinite(config.markupRate) ||
    config.markupRate < 0 ||
    !Number.isSafeInteger(config.minimumProfitMinor) ||
    config.minimumProfitMinor < 0 ||
    !Number.isFinite(config.transactionRate) ||
    config.transactionRate < 0 ||
    config.transactionRate >= 1
  ) return unavailable;

  const markupFloor = cost * (1 + config.markupRate);
  const contributionFloor = (cost + config.minimumProfitMinor) / (1 - config.transactionRate);
  const sellingPriceMinor = roundUpToTenMinor(Math.max(markupFloor, contributionFloor));
  if (!validPositiveMinor(sellingPriceMinor) || sellingPriceMinor < cost) return unavailable;

  const netAfterTransaction = sellingPriceMinor * (1 - config.transactionRate);
  const profitMinor = Math.round(netAfterTransaction - cost);
  const markupPercent = round2(((sellingPriceMinor - cost) / cost) * 100);
  const profitPercent = netAfterTransaction > 0 ? round2((profitMinor / netAfterTransaction) * 100) : null;

  return {
    sellingPriceMinor,
    markupPercent,
    profitMinor,
    profitPercent,
    supplierCostMinor: cost,
    rule: "sym_v1_markup_and_min_contribution"
  };
}

function validPositiveMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function roundUpToTenMinor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 10) * 10;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nonNegativeInteger(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function nonNegativeRate(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boundedRate(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : fallback;
}
