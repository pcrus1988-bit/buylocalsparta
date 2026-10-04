import {
  CATALOG_COLOR_INDEX,
  CATALOG_SHADE_REFERENCES,
  normalizeCatalogHex,
  resolveCatalogShade as resolveSharedCatalogShade
} from "@buy-local-sparta/core";

export type LabColor = Readonly<{ l: number; a: number; b: number }>;

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

type Rgb = Readonly<{ r: number; g: number; b: number }>;

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

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error("Invalid HEX color");
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function srgbChannel(value: number): number {
  const n = value / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

export function hexToLab(hex: string): LabColor {
  const rgb = hexToRgb(hex);
  const r = srgbChannel(rgb.r);
  const g = srgbChannel(rgb.g);
  const b = srgbChannel(rgb.b);

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

  const pivot = (value: number) => value > 0.008856451679 ? Math.cbrt(value) : (7.787037037 * value) + (16 / 116);
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);

  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (radiansValue: number) => radiansValue * 180 / Math.PI;

export function deltaE2000(left: LabColor, right: LabColor): number {
  const avgL = (left.l + right.l) / 2;
  const c1 = Math.sqrt(left.a * left.a + left.b * left.b);
  const c2 = Math.sqrt(right.a * right.a + right.b * right.b);
  const avgC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1 = (1 + g) * left.a;
  const a2 = (1 + g) * right.a;
  const c1p = Math.sqrt(a1 * a1 + left.b * left.b);
  const c2p = Math.sqrt(a2 * a2 + right.b * right.b);
  const h1 = ((degrees(Math.atan2(left.b, a1)) % 360) + 360) % 360;
  const h2 = ((degrees(Math.atan2(right.b, a2)) % 360) + 360) % 360;

  const dL = right.l - left.l;
  const dC = c2p - c1p;
  let dh = h2 - h1;
  if (c1p * c2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(radians(dh / 2));

  const avgLp = (left.l + right.l) / 2;
  const avgCp = (c1p + c2p) / 2;
  let avgHp = h1 + h2;
  if (c1p * c2p === 0) avgHp = h1 + h2;
  else if (Math.abs(h1 - h2) <= 180) avgHp = (h1 + h2) / 2;
  else if (h1 + h2 < 360) avgHp = (h1 + h2 + 360) / 2;
  else avgHp = (h1 + h2 - 360) / 2;

  const t = 1
    - 0.17 * Math.cos(radians(avgHp - 30))
    + 0.24 * Math.cos(radians(2 * avgHp))
    + 0.32 * Math.cos(radians(3 * avgHp + 6))
    - 0.20 * Math.cos(radians(4 * avgHp - 63));
  const deltaTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * t;
  const rt = -Math.sin(radians(2 * deltaTheta)) * rc;

  const lTerm = dL / sl;
  const cTerm = dC / sc;
  const hTerm = dH / sh;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm);
}

export function colorMatchPercent(deltaE: number): number {
  return Math.max(1, Math.min(100, Math.round(100 * Math.exp(-Math.max(0, deltaE) / 26))));
}


const shadeLabCache = new Map<string, LabColor>();

function cachedShadeLab(hex: string): LabColor {
  const cached = shadeLabCache.get(hex);
  if (cached) return cached;
  const lab = hexToLab(hex);
  shadeLabCache.set(hex, lab);
  return lab;
}

export function nearestColorName(hex: string): Readonly<{ label: string; referenceHex: string; deltaE: number }> {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error("Invalid HEX color");

  const target = hexToLab(normalized);
  let best: Readonly<{ label: string; referenceHex: string; deltaE: number }> | undefined;

  const references = [
    ...CATALOG_SHADE_REFERENCES.map((entry) => ({ label: entry.displayNameEn, hex: entry.hex })),
    ...CATALOG_COLOR_INDEX.map((entry) => ({ label: entry.displayNameEn, hex: entry.hex }))
  ];

  for (const reference of references) {
    const distance = deltaE2000(target, cachedShadeLab(reference.hex));
    if (!best || distance < best.deltaE) {
      best = { label: reference.label, referenceHex: reference.hex, deltaE: distance };
    }
  }

  return best ?? { label: normalized, referenceHex: normalized, deltaE: 0 };
}
