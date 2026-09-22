export type BuildStudioPackVariant = Readonly<{
  id: string;
  title: string;
  priceMinor: number;
  packLitres: number;
  selectionGroupKey: string;
}>;

export type BuildStudioPackPlanLine = Readonly<{
  variantId: string;
  title: string;
  packLitres: number;
  unitPriceMinor: number;
  quantity: number;
  linePriceMinor: number;
}>;

export type BuildStudioPackPlan = Readonly<{
  requiredLitres: number;
  suppliedLitres: number;
  surplusLitres: number;
  totalPriceMinor: number;
  totalPacks: number;
  lines: readonly BuildStudioPackPlanLine[];
}>;

function gcd(a: number, b: number): number {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

export function normalizePackLitres(value: unknown, unit: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || typeof unit !== "string") return undefined;
  const normalizedUnit = unit.trim().toLocaleLowerCase("el-GR");
  if (["l", "lt", "ltr", "litre", "liter", "λίτρο", "λίτρα"].includes(normalizedUnit)) return parsed;
  if (["ml", "millilitre", "milliliter"].includes(normalizedUnit)) return parsed / 1000;
  return undefined;
}

function normalizedCommercialTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|lt|ltr|λιτρα|λιτρο)\b/giu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildStudioSelectionGroupKey(input: Readonly<{
  title: string;
  colourHint?: string;
  tintBaseHint?: string;
}>): string {
  const colour = input.colourHint?.trim().toLocaleLowerCase("el-GR");
  if (colour) return `colour:${colour}`;
  const tintBase = input.tintBaseHint?.trim().toLocaleLowerCase("el-GR");
  if (tintBase) return `base:${tintBase}`;
  return `commercial:${normalizedCommercialTitle(input.title)}`;
}

type State = {
  cost: number;
  packs: number;
  previousUnits: number;
  variantIndex: number;
};

function betterForSameCapacity(nextCost: number, nextPacks: number, current: State | undefined): boolean {
  if (!current) return true;
  if (nextCost !== current.cost) return nextCost < current.cost;
  return nextPacks < current.packs;
}

/**
 * Finds a practical purchasable pack combination without changing the
 * manufacturer-declared consumption calculation.
 *
 * 1. It never supplies less than the required litres.
 * 2. It considers combinations up to one largest pack beyond the target.
 * 3. It first establishes the smallest achievable surplus.
 * 4. It allows a wider "sensible surplus" window (up to 50% of the requirement,
 *    capped by one largest pack) so that a materially cheaper larger pack can win.
 * 5. Inside that window it chooses lowest price, then lowest surplus, then fewest packs.
 */
export function optimizeBuildStudioPacks(
  requiredLitres: number,
  variants: readonly BuildStudioPackVariant[]
): BuildStudioPackPlan | undefined {
  if (!Number.isFinite(requiredLitres) || requiredLitres <= 0) return undefined;

  const usable = variants.filter((variant) =>
    variant.id
    && Number.isSafeInteger(variant.priceMinor)
    && variant.priceMinor > 0
    && Number.isFinite(variant.packLitres)
    && variant.packLitres > 0
  );
  if (!usable.length) return undefined;

  const packMl = usable.map((variant) => Math.max(1, Math.round(variant.packLitres * 1000)));
  const unitMl = packMl.reduce((value, pack) => gcd(value, pack));
  const packUnits = packMl.map((value) => Math.max(1, Math.round(value / unitMl)));
  const targetUnits = Math.ceil(requiredLitres * 1000 / unitMl);
  const largestPackUnits = Math.max(...packUnits);
  const maxUnits = targetUnits + largestPackUnits;

  const states: Array<State | undefined> = new Array(maxUnits + 1);
  states[0] = { cost: 0, packs: 0, previousUnits: -1, variantIndex: -1 };

  for (let units = 0; units <= maxUnits; units += 1) {
    const state = states[units];
    if (!state) continue;
    for (let index = 0; index < usable.length; index += 1) {
      const nextUnits = units + packUnits[index];
      if (nextUnits > maxUnits) continue;
      const nextCost = state.cost + usable[index].priceMinor;
      const nextPacks = state.packs + 1;
      if (betterForSameCapacity(nextCost, nextPacks, states[nextUnits])) {
        states[nextUnits] = {
          cost: nextCost,
          packs: nextPacks,
          previousUnits: units,
          variantIndex: index
        };
      }
    }
  }

  const feasible = Array.from({ length: maxUnits - targetUnits + 1 }, (_, offset) => targetUnits + offset)
    .filter((units) => Boolean(states[units]));
  if (!feasible.length) return undefined;

  const minimumSurplus = Math.min(...feasible.map((units) => units - targetUnits));
  const sensibleExtra = Math.max(
    minimumSurplus,
    Math.min(Math.ceil(targetUnits * 0.5), largestPackUnits)
  );
  const sensible = feasible.filter((units) => units - targetUnits <= sensibleExtra);

  sensible.sort((leftUnits, rightUnits) => {
    const left = states[leftUnits]!;
    const right = states[rightUnits]!;
    return left.cost - right.cost
      || (leftUnits - targetUnits) - (rightUnits - targetUnits)
      || left.packs - right.packs;
  });

  const chosenUnits = sensible[0];
  const chosen = states[chosenUnits]!;
  const counts = new Array(usable.length).fill(0) as number[];
  let cursor = chosenUnits;
  while (cursor > 0) {
    const state = states[cursor];
    if (!state || state.variantIndex < 0 || state.previousUnits < 0) return undefined;
    counts[state.variantIndex] += 1;
    cursor = state.previousUnits;
  }

  const lines = usable.flatMap((variant, index) => {
    const quantity = counts[index];
    if (!quantity) return [];
    return [{
      variantId: variant.id,
      title: variant.title,
      packLitres: variant.packLitres,
      unitPriceMinor: variant.priceMinor,
      quantity,
      linePriceMinor: variant.priceMinor * quantity
    } satisfies BuildStudioPackPlanLine];
  }).sort((left, right) => right.packLitres - left.packLitres || left.unitPriceMinor - right.unitPriceMinor);

  const suppliedLitres = lines.reduce((sum, line) => sum + line.packLitres * line.quantity, 0);
  return {
    requiredLitres: Math.round(requiredLitres * 100) / 100,
    suppliedLitres: Math.round(suppliedLitres * 1000) / 1000,
    surplusLitres: Math.round(Math.max(0, suppliedLitres - requiredLitres) * 1000) / 1000,
    totalPriceMinor: chosen.cost,
    totalPacks: chosen.packs,
    lines
  };
}
