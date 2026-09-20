export type SpvRedemptionLine = Readonly<{
  lineId: string;
  grossMinor: number;
  vatRateBps: number;
}>;

export type SpvRedemptionAllocation = Readonly<{
  lineId: string;
  redemptionMinor: number;
  remainingGrossMinor: number;
  remainingNetMinor: number;
  remainingVatMinor: number;
}>;

export function splitVatInclusiveGross(grossMinor: number, vatRateBps: number): Readonly<{ netMinor: number; vatMinor: number }> {
  assertMoney(grossMinor, "grossMinor");
  if (!Number.isSafeInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10_000) throw new Error("VAT rate must be a safe basis-point value");
  if (grossMinor === 0 || vatRateBps === 0) return { netMinor: grossMinor, vatMinor: 0 };
  const vatMinor = Math.round((grossMinor * vatRateBps) / (10_000 + vatRateBps));
  return { netMinor: grossMinor - vatMinor, vatMinor };
}

export function allocateSinglePurposeVoucherRedemption(
  lines: readonly SpvRedemptionLine[],
  redeemedMinor: number,
  voucherVatRateBps: number
): Readonly<{
  allocations: readonly SpvRedemptionAllocation[];
  redeemedMinor: number;
  remainingGrossMinor: number;
  remainingNetMinor: number;
  remainingVatMinor: number;
}> {
  assertMoney(redeemedMinor, "redeemedMinor");
  if (!Number.isSafeInteger(voucherVatRateBps) || voucherVatRateBps <= 0 || voucherVatRateBps > 10_000) throw new Error("SPV VAT rate must be a positive safe basis-point value");
  if (!lines.length) {
    if (redeemedMinor !== 0) throw new Error("SPV redemption cannot be allocated without merchandise lines");
    return { allocations: [], redeemedMinor: 0, remainingGrossMinor: 0, remainingNetMinor: 0, remainingVatMinor: 0 };
  }

  const normalized = lines.map((line, index) => {
    assertMoney(line.grossMinor, `lines[${index}].grossMinor`);
    if (!line.lineId?.trim()) throw new Error("SPV allocation requires line ids");
    if (!Number.isSafeInteger(line.vatRateBps) || line.vatRateBps < 0) throw new Error("SPV allocation line VAT rate is invalid");
    if (line.grossMinor > 0 && line.vatRateBps !== voucherVatRateBps) {
      throw new Error(`Single-purpose voucher VAT rate ${voucherVatRateBps} cannot be redeemed against line ${line.lineId} at VAT rate ${line.vatRateBps}`);
    }
    return { ...line, index };
  });
  const merchandiseGross = normalized.reduce((sum, line) => sum + line.grossMinor, 0);
  if (redeemedMinor > merchandiseGross) throw new Error("SPV redemption exceeds eligible merchandise gross");

  const provisional = normalized.map((line) => {
    if (redeemedMinor === 0 || merchandiseGross === 0 || line.grossMinor === 0) return { line, allocation: 0, remainder: 0 };
    const numerator = redeemedMinor * line.grossMinor;
    return { line, allocation: Math.floor(numerator / merchandiseGross), remainder: numerator % merchandiseGross };
  });
  let unallocated = redeemedMinor - provisional.reduce((sum, item) => sum + item.allocation, 0);
  const ranked = [...provisional].sort((a, b) => b.remainder - a.remainder || a.line.index - b.line.index);
  for (const item of ranked) {
    if (unallocated <= 0) break;
    if (item.line.grossMinor > item.allocation) {
      item.allocation += 1;
      unallocated -= 1;
    }
  }
  if (unallocated !== 0) throw new Error("SPV redemption allocation did not balance");

  const allocations = provisional.map(({ line, allocation }) => {
    const remainingGrossMinor = line.grossMinor - allocation;
    const { netMinor, vatMinor } = splitVatInclusiveGross(remainingGrossMinor, line.vatRateBps);
    return { lineId: line.lineId, redemptionMinor: allocation, remainingGrossMinor, remainingNetMinor: netMinor, remainingVatMinor: vatMinor };
  });
  return {
    allocations,
    redeemedMinor,
    remainingGrossMinor: allocations.reduce((sum, line) => sum + line.remainingGrossMinor, 0),
    remainingNetMinor: allocations.reduce((sum, line) => sum + line.remainingNetMinor, 0),
    remainingVatMinor: allocations.reduce((sum, line) => sum + line.remainingVatMinor, 0)
  };
}

function assertMoney(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer minor-unit amount`);
}
