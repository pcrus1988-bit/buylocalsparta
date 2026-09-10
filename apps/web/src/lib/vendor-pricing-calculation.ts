export type VendorPricingMode = "manual" | "calculated";
export type VendorPricingAdjustmentType = "percent" | "fixed";

export type VendorPricingCalculationInput = Readonly<{
  buyingPriceMinor: number;
  markupType?: VendorPricingAdjustmentType;
  markupValue?: number;
  discountType?: VendorPricingAdjustmentType;
  discountValue?: number;
}>;

const MAX_PRICE_MINOR = 100_000_000;
const MAX_ADJUSTMENT_VALUE = 1_000_000;

export function validPriceMinor(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRICE_MINOR;
}

export function validateAdjustment(type: VendorPricingAdjustmentType | undefined, value: number | undefined, label: string) {
  if (type === undefined) {
    if (value !== undefined && value !== 0) throw new Error(`${label}: επίλεξε πρώτα % ή €.`);
    return;
  }
  if (type !== "percent" && type !== "fixed") throw new Error(`${label}: μη έγκυρος τύπος.`);
  if (value === undefined || !Number.isFinite(value) || value < 0 || value > MAX_ADJUSTMENT_VALUE) {
    throw new Error(`${label}: μη έγκυρη τιμή.`);
  }
  if (type === "percent" && value > 100 && label === "Έκπτωση") {
    throw new Error("Η έκπτωση σε ποσοστό πρέπει να είναι από 0% έως 100%.");
  }
}

function adjustmentMinor(baseMinor: number, type: VendorPricingAdjustmentType | undefined, value: number | undefined) {
  if (!type || value === undefined) return 0;
  return type === "percent"
    ? Math.round(baseMinor * value / 100)
    : Math.round(value * 100);
}

export function calculateRetailPriceMinor(input: VendorPricingCalculationInput): number {
  if (!validPriceMinor(input.buyingPriceMinor)) throw new Error("Η τιμή αγοράς πρέπει να είναι από 0 € έως 1.000.000 €.");
  validateAdjustment(input.markupType, input.markupValue, "Προσαύξηση");
  validateAdjustment(input.discountType, input.discountValue, "Έκπτωση");

  const afterMarkup = input.buyingPriceMinor + adjustmentMinor(input.buyingPriceMinor, input.markupType, input.markupValue);
  if (!Number.isSafeInteger(afterMarkup) || afterMarkup > MAX_PRICE_MINOR) throw new Error("Η υπολογισμένη τιμή ξεπερνά το επιτρεπτό όριο.");

  const discountMinor = adjustmentMinor(afterMarkup, input.discountType, input.discountValue);
  const retailPriceMinor = Math.max(0, afterMarkup - discountMinor);
  if (!validPriceMinor(retailPriceMinor)) throw new Error("Η τελική τιμή λιανικής δεν είναι έγκυρη.");
  return retailPriceMinor;
}
