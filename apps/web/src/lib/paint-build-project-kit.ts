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
