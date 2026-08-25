export type GrossVatBucket = Readonly<{
  key: string;
  grossMinor: number;
  vatRateBps: number;
}>;

export type GrossVatAllocation = Readonly<{
  key: string;
  grossMinor: number;
  netMinor: number;
  vatMinor: number;
  vatRateBps: number;
}>;

/**
 * Allocate a VAT-inclusive ancillary charge (for example delivery) across the
 * VAT treatments already present in the merchandise basket. Allocation is
 * proportional to merchandise gross value and uses deterministic largest-
 * remainder cent distribution. No VAT rate is guessed: every result inherits
 * a rate supplied by an existing merchandise bucket.
 */
export function allocateGrossChargeByVatBuckets(
  chargeMinor: number,
  buckets: readonly GrossVatBucket[]
): readonly GrossVatAllocation[] {
  assertNonNegativeInteger(chargeMinor, "chargeMinor");
  if (chargeMinor === 0) return [];

  const combined = new Map<string, { grossMinor: number; vatRateBps: number }>();
  for (const bucket of buckets) {
    if (!bucket.key.trim()) throw new Error("VAT allocation bucket key is required");
    assertNonNegativeInteger(bucket.grossMinor, "bucket.grossMinor");
    assertNonNegativeInteger(bucket.vatRateBps, "bucket.vatRateBps");
    if (bucket.grossMinor === 0) continue;
    const existing = combined.get(bucket.key);
    if (existing && existing.vatRateBps !== bucket.vatRateBps) {
      throw new Error(`VAT allocation bucket ${bucket.key} contains conflicting VAT rates`);
    }
    combined.set(bucket.key, {
      grossMinor: (existing?.grossMinor ?? 0) + bucket.grossMinor,
      vatRateBps: bucket.vatRateBps
    });
  }

  const entries = [...combined.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const merchandiseGrossMinor = entries.reduce((total, entry) => total + entry.grossMinor, 0);
  if (!Number.isSafeInteger(merchandiseGrossMinor) || merchandiseGrossMinor <= 0) {
    throw new Error("A non-zero ancillary charge requires merchandise with an approved VAT treatment");
  }

  const provisional = entries.map((entry) => {
    const numerator = chargeMinor * entry.grossMinor;
    if (!Number.isSafeInteger(numerator)) throw new Error("VAT allocation exceeds safe integer precision");
    return {
      ...entry,
      allocatedGrossMinor: Math.floor(numerator / merchandiseGrossMinor),
      remainder: numerator % merchandiseGrossMinor
    };
  });
  let centsToDistribute = chargeMinor - provisional.reduce((total, entry) => total + entry.allocatedGrossMinor, 0);
  if (centsToDistribute < 0 || centsToDistribute >= provisional.length + 1) {
    throw new Error("Invalid VAT allocation remainder");
  }
  const remainderOrder = [...provisional].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key));
  for (let index = 0; index < centsToDistribute; index += 1) remainderOrder[index]!.allocatedGrossMinor += 1;

  return provisional
    .filter((entry) => entry.allocatedGrossMinor > 0)
    .map((entry) => {
      const adjusted = remainderOrder.find((candidate) => candidate.key === entry.key)!;
      const { netMinor, vatMinor } = splitGross(adjusted.allocatedGrossMinor, adjusted.vatRateBps);
      return Object.freeze({
        key: adjusted.key,
        grossMinor: adjusted.allocatedGrossMinor,
        netMinor,
        vatMinor,
        vatRateBps: adjusted.vatRateBps
      });
    });
}

function splitGross(grossMinor: number, vatRateBps: number): { netMinor: number; vatMinor: number } {
  const denominator = 10_000 + vatRateBps;
  const numerator = grossMinor * 10_000;
  if (!Number.isSafeInteger(numerator)) throw new Error("VAT split exceeds safe integer precision");
  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator % denominator;
  const netMinor = remainder * 2 >= denominator ? quotient + 1 : quotient;
  return { netMinor, vatMinor: grossMinor - netMinor };
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}
