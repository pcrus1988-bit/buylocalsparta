export type PriceHighlightKind = "msrp-savings" | "sale";

/**
 * Public percentage saving against a genuine MSRP/RRP reference price.
 * This must never be used to imply a previous KONTA MOU selling price.
 */
export function publicSavingsPercent(msrpMinor: number, retailPriceMinor: number): number | undefined {
  if (!Number.isSafeInteger(msrpMinor)
    || !Number.isSafeInteger(retailPriceMinor)
    || msrpMinor <= retailPriceMinor
    || retailPriceMinor < 0) return undefined;
  return Math.round(((msrpMinor - retailPriceMinor) / msrpMinor) * 1000) / 10;
}

export function publicSavingsLabel(msrpMinor: number, retailPriceMinor: number): string | undefined {
  const saving = publicSavingsPercent(msrpMinor, retailPriceMinor);
  return saving === undefined
    ? undefined
    : saving.toLocaleString("el-GR", { maximumFractionDigits: 1 });
}

/**
 * SALE is an explicit merchandising state and is deliberately distinct from a
 * normal MSRP saving. A product being below MSRP alone must not make it a SALE.
 */
export function publicPriceBadgeLabel(kind: PriceHighlightKind, savingLabel: string): string {
  return kind === "sale" ? `SALE · −${savingLabel}%` : `−${savingLabel}%`;
}
