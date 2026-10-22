export const DEFAULT_MONTHLY_FEE_EUR = 250;
export const DEFAULT_GROWTH_SHARE = 0.4;

export function allocationPreview(members: number, monthlyFeeEuro = DEFAULT_MONTHLY_FEE_EUR, growthShare = DEFAULT_GROWTH_SHARE) {
  if (!Number.isInteger(members) || members < 0 || members > 100_000) throw new RangeError("Invalid member count");
  if (!Number.isFinite(monthlyFeeEuro) || monthlyFeeEuro < 0 || monthlyFeeEuro > 1_000_000) throw new RangeError("Invalid fee");
  if (!Number.isFinite(growthShare) || growthShare < 0 || growthShare > 1) throw new RangeError("Invalid share");
  // Preview assumes an EX-VAT monthly fee, not collected money or an operational fund.
  const totalEuro = Math.round(members * monthlyFeeEuro * 100) / 100;
  const fundEuro = Math.round(totalEuro * growthShare * 100) / 100;
  return {totalEuro, fundEuro, remainderEuro:Math.round((totalEuro-fundEuro)*100)/100};
}

export type DraftProposal = {
  title: string;
  category: "resilience" | "growth" | "joint";
  amountEuro: number;
  description: string;
};

export function validateDraft(value: DraftProposal): string | null {
  if (value.title.trim().length < 8 || value.title.trim().length > 100) return "Ο τίτλος χρειάζεται 8 έως 100 χαρακτήρες.";
  if (!["resilience","growth","joint"].includes(value.category)) return "Επίλεξε κατηγορία.";
  if (!Number.isInteger(value.amountEuro) || value.amountEuro < 500 || value.amountEuro > 20_000) return "Το ενδεικτικό ποσό είναι από €500 έως €20.000.";
  if (value.description.trim().length < 25 || value.description.trim().length > 1000) return "Περίγραψε τον σκοπό σε 25 έως 1.000 χαρακτήρες.";
  return null;
}
