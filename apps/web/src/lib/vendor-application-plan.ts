export type VendorApplicationPlanCode = "founding_2026" | "annual" | "monthly";

export type VendorApplicationPlanSnapshot = Readonly<{
  code: VendorApplicationPlanCode;
  name: string;
  listingFeeMinor: number;
  monthlyPriceMinor?: number;
  annualPriceMinor?: number;
  termPriceMinor?: number;
  termMonths?: number;
  salesFeeBps: number;
}>;

export type VendorApplicationPlanTerms = Readonly<{
  name: string;
  setup: string;
  subscription: string;
  duration: string;
  commission: string;
}>;

const PLAN_CODES = new Set<VendorApplicationPlanCode>(["founding_2026", "annual", "monthly"]);

export function vendorApplicationPlanSnapshotFromRow(row: Readonly<Record<string, unknown>>): VendorApplicationPlanSnapshot {
  const code = requiredText(row.code, "vendor_plan.code");
  if (!PLAN_CODES.has(code as VendorApplicationPlanCode)) throw new Error(`Unsupported vendor application plan: ${code}`);
  return {
    code: code as VendorApplicationPlanCode,
    name: requiredText(row.name, "vendor_plan.name"),
    listingFeeMinor: nonNegativeInteger(row.listing_fee_minor ?? 0, "vendor_plan.listing_fee_minor"),
    monthlyPriceMinor: optionalNonNegativeInteger(row.monthly_price_minor, "vendor_plan.monthly_price_minor"),
    annualPriceMinor: optionalNonNegativeInteger(row.annual_price_minor, "vendor_plan.annual_price_minor"),
    termPriceMinor: optionalNonNegativeInteger(row.term_price_minor, "vendor_plan.term_price_minor"),
    termMonths: optionalNonNegativeInteger(row.term_months, "vendor_plan.term_months"),
    salesFeeBps: nonNegativeInteger(row.sales_fee_bps ?? 0, "vendor_plan.sales_fee_bps")
  };
}

export function vendorApplicationPlanTerms(plan: VendorApplicationPlanSnapshot): VendorApplicationPlanTerms {
  const subscription = plan.monthlyPriceMinor !== undefined
    ? `${euro(plan.monthlyPriceMinor)} / μήνα`
    : plan.annualPriceMinor !== undefined
      ? `${euro(plan.annualPriceMinor)} / έτος`
      : "€0";
  const duration = plan.termMonths === undefined
    ? "Δεν ορίζεται"
    : plan.termMonths === 1
      ? "1 μήνας"
      : `${plan.termMonths} μήνες`;
  return {
    name: plan.name,
    setup: plan.listingFeeMinor > 0 ? euro(plan.listingFeeMinor) : "€0",
    subscription,
    duration,
    commission: `${(plan.salesFeeBps / 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })}%`
  };
}

export function vendorApplicationPlanCompactLabel(plan: VendorApplicationPlanSnapshot): string {
  const terms = vendorApplicationPlanTerms(plan);
  return `${terms.name} · ένταξη ${terms.setup} · ${terms.subscription} · προμήθεια ${terms.commission}`;
}

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid database field ${field}`);
  return value.trim();
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid database field ${field}`);
  return parsed;
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return nonNegativeInteger(value, field);
}
