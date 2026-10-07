export type PaintBuildPackVariant = Readonly<{
  id: string;
  title: string;
  priceMinor: number;
  packValue: number;
  packUnit: string;
  colourHint?: string;
  tintBaseHint?: string;
  finishHint?: string;
}>;

export type PaintBuildPackLine = Readonly<{
  variant: PaintBuildPackVariant;
  quantity: number;
  litresEach: number;
  totalLitres: number;
  totalPriceMinor: number;
}>;

export type PaintBuildPackPlan = Readonly<{
  requiredLitres: number;
  totalLitres: number;
  surplusLitres: number;
  totalPriceMinor: number;
  packCount: number;
  lines: readonly PaintBuildPackLine[];
}>;

export type PaintBuildMaterialUnit = "L" | "kg";

export type MaterialPackLine = Readonly<{
  variant: PaintBuildPackVariant;
  quantity: number;
  unit: PaintBuildMaterialUnit;
  amountEach: number;
  totalAmount: number;
  totalPriceMinor: number;
}>;

export type MaterialPackPlan = Readonly<{
  unit: PaintBuildMaterialUnit;
  requiredAmount: number;
  totalAmount: number;
  surplusAmount: number;
  totalPriceMinor: number;
  packCount: number;
  lines: readonly MaterialPackLine[];
}>;

export type ProjectAccessoryRule = Readonly<{
  key: string;
  categoryCode: string;
  role: "recommended_working" | "optional_extra";
  labelEl: string;
  quantityForArea: (areaM2: number) => number;
}>;

export const PROJECT_ACCESSORY_RULES: readonly ProjectAccessoryRule[] = [
  {
    key: "paint-roller",
    categoryCode: "paint-decorating-rollers",
    role: "recommended_working",
    labelEl: "Ρολό βαφής",
    quantityForArea: () => 1
  },
  {
    key: "paint-tray",
    categoryCode: "paint-decorating-trays",
    role: "recommended_working",
    labelEl: "Σκαφάκι βαφής",
    quantityForArea: () => 1
  },
  {
    key: "masking-tape",
    categoryCode: "paint-decorating-masking-tape",
    role: "recommended_working",
    labelEl: "Ταινία κάλυψης",
    quantityForArea: (areaM2) => Math.max(1, Math.ceil(areaM2 / 25))
  },
  {
    key: "protective-covering",
    categoryCode: "paint-decorating-protective-covering",
    role: "recommended_working",
    labelEl: "Υλικό προστασίας / κάλυψης",
    quantityForArea: (areaM2) => Math.max(1, Math.ceil(areaM2 / 25))
  },
  {
    key: "extension-pole",
    categoryCode: "paint-decorating-extension-poles",
    role: "optional_extra",
    labelEl: "Προέκταση ρολού",
    quantityForArea: () => 1
  },
  {
    key: "roller-sleeve",
    categoryCode: "paint-decorating-roller-sleeves",
    role: "optional_extra",
    labelEl: "Εφεδρικό ανταλλακτικό ρολού",
    quantityForArea: (areaM2) => areaM2 >= 60 ? 2 : 1
  },
  {
    key: "ppe",
    categoryCode: "paint-decorating-ppe",
    role: "optional_extra",
    labelEl: "Μέσα ατομικής προστασίας",
    quantityForArea: () => 1
  },
  {
    key: "cleaning-tools",
    categoryCode: "paint-decorating-cleaning-tools",
    role: "optional_extra",
    labelEl: "Υλικό καθαρισμού",
    quantityForArea: () => 1
  }
] as const;

export function packLitres(packValue: number, packUnit: string): number | undefined {
  if (!Number.isFinite(packValue) || packValue <= 0) return undefined;
  const unit = packUnit.trim().toLocaleLowerCase("en");
  if (unit === "l" || unit === "lt" || unit === "litre" || unit === "liter") return packValue;
  if (unit === "ml") return packValue / 1000;
  return undefined;
}

export function packMaterialAmount(
  packValue: number,
  packUnit: string,
  targetUnit: PaintBuildMaterialUnit
): number | undefined {
  if (!Number.isFinite(packValue) || packValue <= 0) return undefined;
  const unit = packUnit.trim().toLocaleLowerCase("en");
  if (targetUnit === "L") return packLitres(packValue, packUnit);
  if (unit === "kg" || unit === "kilogram" || unit === "kilograms") return packValue;
  if (unit === "g" || unit === "gr" || unit === "gram" || unit === "grams") return packValue / 1000;
  return undefined;
}

export function variantRouteKey(variant: Pick<PaintBuildPackVariant, "title" | "colourHint" | "tintBaseHint" | "finishHint">): string {
  const normalize = (value?: string) => value?.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLocaleLowerCase("el-GR") || "";
  const title = normalize(variant.title);
  const inferredTint = /(?:λευκ|white)/.test(title) ? "white"
    : /(?:ανοιχτ|light)/.test(title) ? "light"
      : /(?:μεσαι|medium)/.test(title) ? "medium"
        : /(?:σκουρ|dark)/.test(title) ? "dark"
          : "";
  const inferredSystem = /καθετων επιφανειων|vertical/.test(title) ? "vertical" : "";
  return [
    normalize(variant.colourHint) || inferredTint,
    normalize(variant.tintBaseHint) || inferredTint,
    normalize(variant.finishHint),
    inferredSystem
  ].join("|");
}

export function extractManufacturerComponentNames(...values: readonly unknown[]): readonly string[] {
  function names(value: unknown): string[] {
    if (typeof value === "string") {
      const result = value.trim();
      return result ? [result] : [];
    }
    if (Array.isArray(value)) return value.flatMap(names);
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    return [
      ...names(record.required_primer),
      ...names(record.required_component),
      ...names(record.required_components),
      ...names(record.primer),
      ...names(record.product),
      ...names(record.primer_options),
      ...names(record.allowed_primers),
      ...names(record.options)
    ];
  }
  return [...new Set(values.flatMap(names))];
}

export type VerifiedPaintQuantity = Readonly<{
  min: number;
  max: number;
  coatsMin: number;
  coatsMax: number;
  basis: "coverage_and_coats" | "manufacturer_two_coat_coverage";
}>;

function positiveNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Calculates litres only from explicit verified manufacturer values.
 *
 * Preferred basis is ordinary m²/L + explicit coat count. If the manufacturer
 * publishes an explicit aggregate "two coats" coverage, that can safely power a
 * two-coat calculation even when a separate generic coat-count field is absent.
 * No generic paint assumption or waste factor is introduced.
 */
export function calculateVerifiedPaintQuantity(input: Readonly<{
  areaM2: number;
  coverageMin?: number;
  coverageMax?: number;
  coatsMin?: number;
  coatsMax?: number;
  twoCoatCoverageMin?: number;
  twoCoatCoverageMax?: number;
}>): VerifiedPaintQuantity | undefined {
  const areaM2 = positiveNumber(input.areaM2);
  if (!areaM2) return undefined;

  const coverageMin = positiveNumber(input.coverageMin);
  const coverageMax = positiveNumber(input.coverageMax);
  const coatsMin = positiveNumber(input.coatsMin);
  const coatsMax = positiveNumber(input.coatsMax);
  if (coverageMin && coverageMax && coatsMin && coatsMax) {
    const minCoats = Math.min(coatsMin, coatsMax);
    const maxCoats = Math.max(coatsMin, coatsMax);
    return {
      min: Math.round((areaM2 * minCoats / Math.max(coverageMin, coverageMax)) * 100) / 100,
      max: Math.round((areaM2 * maxCoats / Math.min(coverageMin, coverageMax)) * 100) / 100,
      coatsMin: minCoats,
      coatsMax: maxCoats,
      basis: "coverage_and_coats"
    };
  }

  const twoCoatMin = positiveNumber(input.twoCoatCoverageMin);
  const twoCoatMax = positiveNumber(input.twoCoatCoverageMax);
  if (twoCoatMin && twoCoatMax) {
    return {
      min: Math.round((areaM2 / Math.max(twoCoatMin, twoCoatMax)) * 100) / 100,
      max: Math.round((areaM2 / Math.min(twoCoatMin, twoCoatMax)) * 100) / 100,
      coatsMin: 2,
      coatsMax: 2,
      basis: "manufacturer_two_coat_coverage"
    };
  }
  return undefined;
}

export type VerifiedMaterialQuantity = Readonly<{
  min: number;
  max: number;
  unit: PaintBuildMaterialUnit;
  coatsMin?: number;
  coatsMax?: number;
  basis:
    | "coverage_and_coats"
    | "manufacturer_two_coat_coverage"
    | "manufacturer_area_per_mass"
    | "manufacturer_mass_per_area";
}>;

function normalizedConsumptionUnit(value?: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/㎡/g, "m²")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("en");
}

/**
 * Generic quantity calculation for Paint & Build.
 * Supports litres from coating coverage as before, plus mass only when the
 * manufacturer explicitly publishes either m²/kg or kg/m². Unknown units fail closed.
 */
export function calculateVerifiedMaterialQuantity(input: Readonly<{
  areaM2: number;
  coverageMin?: number;
  coverageMax?: number;
  coatsMin?: number;
  coatsMax?: number;
  twoCoatCoverageMin?: number;
  twoCoatCoverageMax?: number;
  consumptionMin?: number;
  consumptionMax?: number;
  consumptionUnit?: string;
}>): VerifiedMaterialQuantity | undefined {
  const paint = calculateVerifiedPaintQuantity(input);
  if (paint) return { ...paint, unit: "L" };

  const areaM2 = positiveNumber(input.areaM2);
  const consumptionMin = positiveNumber(input.consumptionMin);
  const consumptionMax = positiveNumber(input.consumptionMax) ?? consumptionMin;
  if (!areaM2 || !consumptionMin || !consumptionMax) return undefined;

  const low = Math.min(consumptionMin, consumptionMax);
  const high = Math.max(consumptionMin, consumptionMax);
  const unit = normalizedConsumptionUnit(input.consumptionUnit);

  if (/^(m²|m2)\/kg(?:coverage)?$/.test(unit)) {
    return {
      min: Math.round((areaM2 / high) * 100) / 100,
      max: Math.round((areaM2 / low) * 100) / 100,
      unit: "kg",
      basis: "manufacturer_area_per_mass"
    };
  }
  if (/^kg\/(m²|m2)$/.test(unit)) {
    return {
      min: Math.round((areaM2 * low) * 100) / 100,
      max: Math.round((areaM2 * high) * 100) / 100,
      unit: "kg",
      basis: "manufacturer_mass_per_area"
    };
  }
  return undefined;
}

type PlanCandidate = {
  lines: PaintBuildPackLine[];
  totalLitres: number;
  totalPriceMinor: number;
  packCount: number;
};

function candidatePlan(variants: readonly PaintBuildPackVariant[], counts: readonly number[]): PlanCandidate {
  const lines = variants.flatMap((variant, index) => {
    const quantity = counts[index] ?? 0;
    const litresEach = packLitres(variant.packValue, variant.packUnit);
    if (!quantity || !litresEach) return [];
    return [{
      variant,
      quantity,
      litresEach,
      totalLitres: litresEach * quantity,
      totalPriceMinor: variant.priceMinor * quantity
    }];
  });
  return {
    lines,
    totalLitres: lines.reduce((sum, line) => sum + line.totalLitres, 0),
    totalPriceMinor: lines.reduce((sum, line) => sum + line.totalPriceMinor, 0),
    packCount: lines.reduce((sum, line) => sum + line.quantity, 0)
  };
}

/**
 * Chooses a practical pack combination without inventing a generic waste factor.
 *
 * The target is the verified manufacturer-derived requirement. We first find the
 * least-surplus achievable combination. Then we allow a bounded "sensible
 * surplus" window so that a materially cheaper larger pack can beat many small
 * packs. Within that window price wins, followed by surplus and pack count.
 */
export function choosePaintPackPlan(
  variantsInput: readonly PaintBuildPackVariant[],
  requiredLitresInput: number
): PaintBuildPackPlan | undefined {
  const requiredLitres = Number(requiredLitresInput);
  if (!Number.isFinite(requiredLitres) || requiredLitres <= 0) return undefined;

  const deduped = new Map<string, PaintBuildPackVariant>();
  for (const variant of variantsInput) {
    const litres = packLitres(variant.packValue, variant.packUnit);
    if (!litres || !Number.isSafeInteger(variant.priceMinor) || variant.priceMinor <= 0) continue;
    const key = `${litres.toFixed(6)}|${variant.priceMinor}`;
    const current = deduped.get(key);
    if (!current || variant.title.localeCompare(current.title, "el") < 0) deduped.set(key, variant);
  }
  const variants = [...deduped.values()]
    .sort((a, b) => (packLitres(b.packValue, b.packUnit) ?? 0) - (packLitres(a.packValue, a.packUnit) ?? 0))
    .slice(0, 8);
  if (!variants.length) return undefined;

  const litres = variants.map((variant) => packLitres(variant.packValue, variant.packUnit) as number);
  const smallest = Math.min(...litres);
  const maxPacks = Math.min(99, Math.max(2, Math.ceil(requiredLitres / smallest) + 2));
  const candidates: PlanCandidate[] = [];
  const counts = new Array(variants.length).fill(0);

  function enumerate(index: number, currentLitres: number, currentPacks: number) {
    if (index === variants.length) {
      if (currentLitres + 1e-9 >= requiredLitres && currentPacks > 0) {
        candidates.push(candidatePlan(variants, counts));
      }
      return;
    }
    const size = litres[index];
    const remainingPacks = maxPacks - currentPacks;
    const enough = Math.ceil(Math.max(0, requiredLitres - currentLitres) / size);
    const cap = Math.min(remainingPacks, Math.max(1, enough + 2));
    for (let quantity = 0; quantity <= cap; quantity += 1) {
      counts[index] = quantity;
      enumerate(index + 1, currentLitres + size * quantity, currentPacks + quantity);
      if (candidates.length > 15000) break;
    }
    counts[index] = 0;
  }
  enumerate(0, 0, 0);
  if (!candidates.length) return undefined;

  const leastSurplus = Math.min(...candidates.map((candidate) => candidate.totalLitres - requiredLitres));
  const sensibleWindow = Math.max(smallest, requiredLitres * 0.4);
  const practical = candidates.filter(
    (candidate) => candidate.totalLitres - requiredLitres <= leastSurplus + sensibleWindow + 1e-9
  );
  practical.sort((a, b) =>
    a.totalPriceMinor - b.totalPriceMinor
    || (a.totalLitres - requiredLitres) - (b.totalLitres - requiredLitres)
    || a.packCount - b.packCount
  );
  const best = practical[0] ?? candidates[0];
  return {
    requiredLitres: Math.round(requiredLitres * 100) / 100,
    totalLitres: Math.round(best.totalLitres * 1000) / 1000,
    surplusLitres: Math.round((best.totalLitres - requiredLitres) * 1000) / 1000,
    totalPriceMinor: best.totalPriceMinor,
    packCount: best.packCount,
    lines: best.lines
  };
}


type MaterialPlanCandidate = {
  lines: MaterialPackLine[];
  totalAmount: number;
  totalPriceMinor: number;
  packCount: number;
};

function materialCandidatePlan(
  variants: readonly PaintBuildPackVariant[],
  counts: readonly number[],
  unit: PaintBuildMaterialUnit
): MaterialPlanCandidate {
  const lines = variants.flatMap((variant, index) => {
    const quantity = counts[index] ?? 0;
    const amountEach = packMaterialAmount(variant.packValue, variant.packUnit, unit);
    if (!quantity || !amountEach) return [];
    return [{
      variant,
      quantity,
      unit,
      amountEach,
      totalAmount: amountEach * quantity,
      totalPriceMinor: variant.priceMinor * quantity
    }];
  });
  return {
    lines,
    totalAmount: lines.reduce((sum, line) => sum + line.totalAmount, 0),
    totalPriceMinor: lines.reduce((sum, line) => sum + line.totalPriceMinor, 0),
    packCount: lines.reduce((sum, line) => sum + line.quantity, 0)
  };
}

/**
 * Unit-aware pack optimizer. It never converts between volume and mass and
 * therefore cannot silently assume product density.
 */
export function chooseMaterialPackPlan(
  variantsInput: readonly PaintBuildPackVariant[],
  requiredAmountInput: number,
  unit: PaintBuildMaterialUnit
): MaterialPackPlan | undefined {
  const requiredAmount = Number(requiredAmountInput);
  if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) return undefined;

  const deduped = new Map<string, PaintBuildPackVariant>();
  for (const variant of variantsInput) {
    const amount = packMaterialAmount(variant.packValue, variant.packUnit, unit);
    if (!amount || !Number.isSafeInteger(variant.priceMinor) || variant.priceMinor <= 0) continue;
    const key = `${amount.toFixed(6)}|${variant.priceMinor}`;
    const current = deduped.get(key);
    if (!current || variant.title.localeCompare(current.title, "el") < 0) deduped.set(key, variant);
  }
  const variants = [...deduped.values()]
    .sort((a, b) =>
      (packMaterialAmount(b.packValue, b.packUnit, unit) ?? 0)
      - (packMaterialAmount(a.packValue, a.packUnit, unit) ?? 0)
    )
    .slice(0, 8);
  if (!variants.length) return undefined;

  const amounts = variants.map((variant) => packMaterialAmount(variant.packValue, variant.packUnit, unit) as number);
  const smallest = Math.min(...amounts);
  const maxPacks = Math.min(99, Math.max(2, Math.ceil(requiredAmount / smallest) + 2));
  const candidates: MaterialPlanCandidate[] = [];
  const counts = new Array(variants.length).fill(0);

  function enumerate(index: number, currentAmount: number, currentPacks: number) {
    if (index === variants.length) {
      if (currentAmount + 1e-9 >= requiredAmount && currentPacks > 0) {
        candidates.push(materialCandidatePlan(variants, counts, unit));
      }
      return;
    }
    const size = amounts[index];
    const remainingPacks = maxPacks - currentPacks;
    const enough = Math.ceil(Math.max(0, requiredAmount - currentAmount) / size);
    const cap = Math.min(remainingPacks, Math.max(1, enough + 2));
    for (let quantity = 0; quantity <= cap; quantity += 1) {
      counts[index] = quantity;
      enumerate(index + 1, currentAmount + size * quantity, currentPacks + quantity);
      if (candidates.length > 15000) break;
    }
    counts[index] = 0;
  }

  enumerate(0, 0, 0);
  if (!candidates.length) return undefined;
  const leastSurplus = Math.min(...candidates.map((candidate) => candidate.totalAmount - requiredAmount));
  const sensibleWindow = Math.max(smallest, requiredAmount * 0.4);
  const practical = candidates.filter(
    (candidate) => candidate.totalAmount - requiredAmount <= leastSurplus + sensibleWindow + 1e-9
  );
  practical.sort((a, b) =>
    a.totalPriceMinor - b.totalPriceMinor
    || (a.totalAmount - requiredAmount) - (b.totalAmount - requiredAmount)
    || a.packCount - b.packCount
  );
  const best = practical[0] ?? candidates[0];
  return {
    unit,
    requiredAmount: Math.round(requiredAmount * 100) / 100,
    totalAmount: Math.round(best.totalAmount * 1000) / 1000,
    surplusAmount: Math.round((best.totalAmount - requiredAmount) * 1000) / 1000,
    totalPriceMinor: best.totalPriceMinor,
    packCount: best.packCount,
    lines: best.lines
  };
}
