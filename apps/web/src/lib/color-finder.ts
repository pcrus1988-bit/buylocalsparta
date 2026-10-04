import {
  catalogDeltaE2000,
  catalogHexToLab,
  nearestCatalogShadeByHex,
  normalizeCatalogHex,
  resolveCatalogShade as resolveSharedCatalogShade,
  type CatalogLabColor
} from "@buy-local-sparta/core";

export type LabColor = CatalogLabColor;

export type ColorFinderProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  brand?: string;
  brandShade?: string;
  shadeCode?: string;
  colorDetail?: string;
  profilePrecision?: "exact" | "canonicalized" | "family_estimate";
  profileConfidence?: number;
  colorHex: string;
  colorLabel: string;
  finish: ColorFinish;
  productType: ColorProductType;
  priceMinor: number;
  price: string;
  imageSrc: string;
  mediaAlt?: string;
}>;

export type ColorFinish = "cream" | "pearly" | "shimmer" | "metallic" | "glitter" | "matte" | "jelly" | "classic";
export type ColorProductType = "gel" | "regular" | "other";

export const COLOR_FINDER_PRESETS = [
  { label: "Dark Cherry", hex: "#7A2538" },
  { label: "Rouge", hex: "#B52E2E" },
  { label: "Rosewood", hex: "#9B5362" },
  { label: "Pearly Pink", hex: "#D998A8" },
  { label: "Nude", hex: "#C79C88" },
  { label: "Coral", hex: "#E97668" },
  { label: "Berry", hex: "#8C3F5B" },
  { label: "Mocha", hex: "#806056" },
  { label: "Plum", hex: "#67445F" },
  { label: "Midnight", hex: "#28314E" }
] as const;

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeHex(value: string): string | undefined {
  return normalizeCatalogHex(value);
}

export type ResolvedStudioColor = Readonly<{
  hex: string;
  label: string;
  familyKey?: string;
  shadeKey: string;
  precision: "exact" | "reference" | "family";
}>;

export function resolveCatalogColor(input: { color?: string; title?: string }): ResolvedStudioColor | undefined {
  const candidates = [
    { value: input.color?.trim(), priority: 1 },
    { value: input.title?.trim(), priority: 0 }
  ].flatMap((candidate) => {
    if (!candidate.value) return [];
    const resolved = resolveSharedCatalogShade(candidate.value);
    if (!resolved) return [];
    const precisionRank = resolved.precision === "exact" ? 3 : resolved.precision === "reference" ? 2 : 1;
    return [{ resolved, priority: candidate.priority, precisionRank }];
  });

  const winner = candidates.sort((left, right) =>
    right.precisionRank - left.precisionRank || right.priority - left.priority
  )[0];
  if (!winner) return undefined;

  return {
    hex: winner.resolved.hex,
    label: winner.resolved.displayNameEn,
    familyKey: winner.resolved.familyKey,
    shadeKey: winner.resolved.key,
    precision: winner.resolved.precision
  };
}

export function inferColorFinish(value: string): ColorFinish {
  const text = normalizeText(value);
  if (/pearl|pearly|perle|περλε|ιριδ/.test(text)) return "pearly";
  if (/shimmer|shiny|sparkle|λαμψη|λαμπερ/.test(text)) return "shimmer";
  if (/metallic|chrome|μεταλλ/.test(text)) return "metallic";
  if (/glitter|glittery|γκλιτερ/.test(text)) return "glitter";
  if (/matte|matt|ματ\b/.test(text)) return "matte";
  if (/jelly|sheer|διαφαν/.test(text)) return "jelly";
  if (/cream|creme|κρεμ/.test(text)) return "cream";
  return "classic";
}

export function inferColorProductType(value: string): ColorProductType {
  const text = normalizeText(value);
  if (/\bgel\b|semi permanent|semipermanent|ημιμονι/.test(text)) return "gel";
  if (/polish|lacquer|βερνικ|μανικιουρ/.test(text)) return "regular";
  return "other";
}

export function hexToLab(hex: string): LabColor {
  return catalogHexToLab(hex);
}

export function deltaE2000(left: LabColor, right: LabColor): number {
  return catalogDeltaE2000(left, right);
}

export function colorMatchPercent(deltaE: number): number {
  return Math.max(1, Math.min(100, Math.round(100 * Math.exp(-Math.max(0, deltaE) / 26))));
}


export function nearestColorName(hex: string): Readonly<{ label: string; referenceHex: string; deltaE: number }> {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error("Invalid HEX color");

  const nearest = nearestCatalogShadeByHex(normalized);
  return nearest
    ? { label: nearest.displayNameEn, referenceHex: nearest.referenceHex, deltaE: nearest.deltaE }
    : { label: normalized, referenceHex: normalized, deltaE: 0 };
}
