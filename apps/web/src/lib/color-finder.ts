export type LabColor = Readonly<{ l: number; a: number; b: number }>;

export type ColorFinderProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  brand?: string;
  brandShade?: string;
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

const SHADE_DICTIONARY: ReadonlyArray<readonly [readonly string[], string, string]> = [
  [["burgundy", "bordeaux", "bordo", "μπορντό", "wine", "vino"], "#6D213C", "Burgundy"],
  [["maroon"], "#6A1B2B", "Maroon"],
  [["cherry", "κερασί"], "#B31B34", "Cherry"],
  [["berry", "berries"], "#8F3155", "Berry"],
  [["rouge", "scarlet", "κόκκινο", "red"], "#C8323E", "Red"],
  [["coral", "κοραλί"], "#EF6F61", "Coral"],
  [["terracotta"], "#B95F4B", "Terracotta"],
  [["orange", "πορτοκαλί"], "#E97831", "Orange"],
  [["peach", "ροδακινί"], "#EFA383", "Peach"],
  [["salmon"], "#E9827B", "Salmon"],
  [["fuchsia", "φούξια"], "#D62D76", "Fuchsia"],
  [["magenta"], "#C83278", "Magenta"],
  [["rosewood"], "#9B4E5E", "Rosewood"],
  [["dusty rose"], "#B77A86", "Dusty Rose"],
  [["rose", "rosé"], "#C96878", "Rose"],
  [["pink", "ροζ"], "#D9859B", "Pink"],
  [["blush"], "#DFA4A8", "Blush"],
  [["mauve"], "#9C687B", "Mauve"],
  [["plum"], "#70405A", "Plum"],
  [["violet"], "#79538E", "Violet"],
  [["purple", "μωβ", "lilac", "lavender"], "#8267A8", "Purple"],
  [["navy"], "#263A64", "Navy"],
  [["cobalt"], "#2D52A0", "Cobalt"],
  [["blue", "μπλε"], "#4C6F9E", "Blue"],
  [["teal"], "#347E80", "Teal"],
  [["turquoise"], "#3A9FA1", "Turquoise"],
  [["emerald"], "#2D7657", "Emerald"],
  [["olive"], "#777A43", "Olive"],
  [["green", "πράσινο"], "#4D8058", "Green"],
  [["mint"], "#8FC6AE", "Mint"],
  [["chocolate"], "#6A4439", "Chocolate"],
  [["mocha"], "#846257", "Mocha"],
  [["taupe"], "#8C7A72", "Taupe"],
  [["brown", "καφέ"], "#795649", "Brown"],
  [["caramel"], "#A8704F", "Caramel"],
  [["beige", "μπεζ"], "#C4A68C", "Beige"],
  [["nude", "natural", "φυσικό"], "#C89A86", "Nude"],
  [["champagne"], "#D5BE92", "Champagne"],
  [["gold", "χρυσό"], "#C49A52", "Gold"],
  [["silver", "ασημί"], "#B9BCC2", "Silver"],
  [["grey", "gray", "γκρι"], "#7F8085", "Grey"],
  [["black", "μαύρο"], "#19191B", "Black"],
  [["white", "λευκό"], "#F2EEE8", "White"],
  [["milky"], "#E9D9D5", "Milky"],
  [["ivory"], "#E7DDC8", "Ivory"]
] as const;

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
  const clean = value.trim();
  const short = clean.match(/^#?([0-9a-f]{3})$/i);
  if (short) return `#${short[1].split("").map((part) => part + part).join("").toUpperCase()}`;
  const full = clean.match(/^#?([0-9a-f]{6})$/i);
  return full ? `#${full[1].toUpperCase()}` : undefined;
}

export function resolveCatalogColor(input: { color?: string; title?: string }): { hex: string; label: string } | undefined {
  const raw = [input.color ?? "", input.title ?? ""].filter(Boolean).join(" ");
  const explicit = raw.match(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i);
  if (explicit) {
    const hex = normalizeHex(explicit[0]);
    if (hex) return { hex, label: input.color?.trim() || hex };
  }

  const normalized = normalizeText(raw);
  for (const [tokens, hex, label] of SHADE_DICTIONARY) {
    if (tokens.some((token) => normalized.includes(normalizeText(token)))) return { hex, label: input.color?.trim() || label };
  }
  return undefined;
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
