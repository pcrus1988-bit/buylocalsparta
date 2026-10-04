export type CatalogColorSwatchKind = "solid" | "transparent" | "multicolor";

export type CatalogColorIndexEntry = Readonly<{
  key: string;
  displayNameEl: string;
  displayNameEn: string;
  hex: `#${string}`;
  ralApprox?: string;
  cssName?: string;
  swatchKind?: CatalogColorSwatchKind;
  aliases: readonly string[];
}>;

export type ResolvedCatalogColor = Readonly<{
  key: string;
  displayNameEl: string;
  displayNameEn: string;
  sourceValue: string;
  matchedAlias: string;
  hex: `#${string}`;
  ralApprox?: string;
  cssName?: string;
  swatchKind: CatalogColorSwatchKind;
  rgb: readonly [number, number, number];
  hsl: string;
  cmyk: string;
}>;

export type CatalogShadeReference = Readonly<{
  key: string;
  familyKey: string;
  displayNameEl: string;
  displayNameEn: string;
  hex: `#${string}`;
  aliases: readonly string[];
}>;

export type ResolvedCatalogShade = Readonly<{
  key: string;
  familyKey?: string;
  displayNameEl: string;
  displayNameEn: string;
  sourceValue: string;
  matchedAlias: string;
  hex: `#${string}`;
  precision: "exact" | "reference" | "family";
}>;

export type CatalogLabColor = Readonly<{ l: number; a: number; b: number }>;

/**
 * Shared consumer-colour reference used by catalogue ingestion and storefront
 * presentation. RAL values are deliberately named `ralApprox`: retail colour
 * names such as beige, blush, sand or navy are not standards and must never be
 * represented as an exact manufacturer colour specification unless the source
 * explicitly supplies one.
 */
export const CATALOG_COLOR_INDEX: readonly CatalogColorIndexEntry[] = [
  { key: "white", displayNameEl: "Λευκό", displayNameEn: "White", hex: "#F7F7F3", ralApprox: "RAL 9016", cssName: "white", aliases: ["white", "λευκο", "ασπρο", "white colour", "λευκο χρωμα"] },
  { key: "off-white", displayNameEl: "Σπασμένο λευκό", displayNameEn: "Off White", hex: "#F2EFE6", ralApprox: "RAL 9001", aliases: ["off white", "off-white", "σπασμενο λευκο", "εκρου λευκο", "warm white"] },
  { key: "ivory", displayNameEl: "Ιβουάρ", displayNameEn: "Ivory", hex: "#F1E7CE", ralApprox: "RAL 1015", aliases: ["ivory", "ιβουαρ", "ελεφαντι", "elephant", "light ivory"] },
  { key: "cream", displayNameEl: "Κρεμ", displayNameEn: "Cream", hex: "#F1E2BE", ralApprox: "RAL 1013", aliases: ["cream", "κρεμ", "creme", "vanilla", "βανιλια"] },
  { key: "beige", displayNameEl: "Μπεζ", displayNameEn: "Beige", hex: "#D6C2A6", ralApprox: "RAL 1001", aliases: ["beige", "μπεζ", "mpez", "beige melange", "light beige", "ανοιχτο μπεζ"] },
  { key: "sand", displayNameEl: "Άμμου", displayNameEn: "Sand", hex: "#D8C29D", ralApprox: "RAL 1002", aliases: ["sand", "sand beige", "αμμου", "αμμος", "sandy", "desert"] },
  { key: "nude", displayNameEl: "Nude", displayNameEn: "Nude", hex: "#D8B5A5", ralApprox: "RAL 3012", aliases: ["nude", "νουντ", "skin", "skin tone", "natural nude"] },
  { key: "camel", displayNameEl: "Κάμελ", displayNameEn: "Camel", hex: "#B58A5A", ralApprox: "RAL 1011", aliases: ["camel", "καμελ", "camel brown", "καμηλο"] },
  { key: "tan", displayNameEl: "Ταμπά", displayNameEn: "Tan", hex: "#B78962", ralApprox: "RAL 8023", aliases: ["tan", "ταμπα", "tobacco", "tobacco brown", "cognac", "κονιακ"] },
  { key: "taupe", displayNameEl: "Τάουπ", displayNameEn: "Taupe", hex: "#8B7D70", ralApprox: "RAL 7006", aliases: ["taupe", "ταουπ", "greige", "γκρεζ", "γκρι μπεζ", "grey beige"] },
  { key: "brown", displayNameEl: "Καφέ", displayNameEn: "Brown", hex: "#6B4934", ralApprox: "RAL 8017", cssName: "brown", aliases: ["brown", "καφε", "kafe", "medium brown"] },
  { key: "chocolate", displayNameEl: "Σοκολατί", displayNameEn: "Chocolate", hex: "#4D2F24", ralApprox: "RAL 8017", aliases: ["chocolate", "σοκολατι", "σοκολα", "dark brown", "σκουρο καφε"] },
  { key: "black", displayNameEl: "Μαύρο", displayNameEn: "Black", hex: "#171717", ralApprox: "RAL 9005", cssName: "black", aliases: ["black", "μαυρο", "mavro", "jet black"] },
  { key: "grey", displayNameEl: "Γκρι", displayNameEn: "Grey", hex: "#9A9A96", ralApprox: "RAL 7004", cssName: "gray", aliases: ["grey", "gray", "γκρι", "gkri", "medium grey", "medium gray"] },
  { key: "light-grey", displayNameEl: "Ανοιχτό γκρι", displayNameEn: "Light Grey", hex: "#C9CBC8", ralApprox: "RAL 7035", aliases: ["light grey", "light gray", "ανοιχτο γκρι", "silver grey"] },
  { key: "anthracite", displayNameEl: "Ανθρακί", displayNameEn: "Anthracite", hex: "#3B4142", ralApprox: "RAL 7016", aliases: ["anthracite", "ανθρακι", "charcoal", "charcoal grey", "charcoal gray", "σκουρο γκρι"] },
  { key: "silver", displayNameEl: "Ασημί", displayNameEn: "Silver", hex: "#B8BCBE", ralApprox: "RAL 9006", cssName: "silver", aliases: ["silver", "ασημι", "silver metallic", "metallic silver"] },
  { key: "gold", displayNameEl: "Χρυσό", displayNameEn: "Gold", hex: "#C7A04A", ralApprox: "RAL 1036", cssName: "gold", aliases: ["gold", "golden", "χρυσο", "χρυσαφι", "metallic gold"] },
  { key: "rose-gold", displayNameEl: "Ροζ χρυσό", displayNameEn: "Rose Gold", hex: "#B77B74", aliases: ["rose gold", "rose-gold", "ροζ χρυσο", "pink gold"] },
  { key: "red", displayNameEl: "Κόκκινο", displayNameEn: "Red", hex: "#D52B2B", ralApprox: "RAL 3020", cssName: "red", aliases: ["red", "κοκκινο", "kokkino", "bright red"] },
  { key: "burgundy", displayNameEl: "Μπορντό", displayNameEn: "Burgundy", hex: "#6B2637", ralApprox: "RAL 3005", aliases: ["burgundy", "μπορντο", "bordeaux", "μπορντω", "wine", "κρασι", "wine red"] },
  { key: "maroon", displayNameEl: "Βυσσινί", displayNameEn: "Maroon", hex: "#681F2A", ralApprox: "RAL 3004", cssName: "maroon", aliases: ["maroon", "βυσσινι", "oxblood", "dark red", "σκουρο κοκκινο"] },
  { key: "pink", displayNameEl: "Ροζ", displayNameEn: "Pink", hex: "#F0AFC0", ralApprox: "RAL 3015", cssName: "pink", aliases: ["pink", "ροζ", "roz", "light pink", "ανοιχτο ροζ", "baby pink"] },
  { key: "blush", displayNameEl: "Ροζ πούδρα", displayNameEn: "Blush Pink", hex: "#DFA9A5", ralApprox: "RAL 3015", aliases: ["blush", "blush pink", "dusty pink", "powder pink", "ροζ πουδρα", "πουδρα", "dusty rose", "old rose", "σαπιο μηλο"] },
  { key: "fuchsia", displayNameEl: "Φούξια", displayNameEn: "Fuchsia", hex: "#C7287D", ralApprox: "RAL 4010", cssName: "fuchsia", aliases: ["fuchsia", "fuschia", "φουξια", "magenta", "ματζεντα", "hot pink"] },
  { key: "coral", displayNameEl: "Κοραλί", displayNameEn: "Coral", hex: "#E87562", ralApprox: "RAL 3016", cssName: "coral", aliases: ["coral", "κοραλι", "coral red"] },
  { key: "peach", displayNameEl: "Ροδακινί", displayNameEn: "Peach", hex: "#F2B79F", ralApprox: "RAL 3012", aliases: ["peach", "ροδακινι", "peachy", "apricot", "βεραμαν ροδακινι"] },
  { key: "salmon", displayNameEl: "Σομόν", displayNameEn: "Salmon", hex: "#ED8B7A", ralApprox: "RAL 3022", cssName: "salmon", aliases: ["salmon", "σομον", "salmon pink"] },
  { key: "orange", displayNameEl: "Πορτοκαλί", displayNameEn: "Orange", hex: "#F07924", ralApprox: "RAL 2004", cssName: "orange", aliases: ["orange", "πορτοκαλι", "orange red"] },
  { key: "yellow", displayNameEl: "Κίτρινο", displayNameEn: "Yellow", hex: "#F2C230", ralApprox: "RAL 1023", cssName: "yellow", aliases: ["yellow", "κιτρινο", "kitrino", "bright yellow"] },
  { key: "mustard", displayNameEl: "Μουσταρδί", displayNameEn: "Mustard", hex: "#C99A2E", ralApprox: "RAL 1005", aliases: ["mustard", "μουσταρδι", "ochre", "ωχρα", "ocher"] },
  { key: "purple", displayNameEl: "Μωβ", displayNameEn: "Purple", hex: "#68478D", ralApprox: "RAL 4005", cssName: "purple", aliases: ["purple", "μωβ", "μοβ", "violet", "βιολετι"] },
  { key: "lilac", displayNameEl: "Λιλά", displayNameEn: "Lilac", hex: "#B7A1CB", ralApprox: "RAL 4009", aliases: ["lilac", "λιλα", "light purple", "ανοιχτο μωβ"] },
  { key: "lavender", displayNameEl: "Λεβάντα", displayNameEn: "Lavender", hex: "#AFA3D5", ralApprox: "RAL 4009", cssName: "lavender", aliases: ["lavender", "λεβαντα", "lavanda"] },
  { key: "blue", displayNameEl: "Μπλε", displayNameEn: "Blue", hex: "#2F6DA8", ralApprox: "RAL 5015", cssName: "blue", aliases: ["blue", "μπλε", "ble", "medium blue"] },
  { key: "navy", displayNameEl: "Σκούρο μπλε", displayNameEn: "Navy", hex: "#24364B", ralApprox: "RAL 5003", cssName: "navy", aliases: ["navy", "navy blue", "σκουρο μπλε", "marine", "marin", "μπλε μαριν"] },
  { key: "royal-blue", displayNameEl: "Ρουά", displayNameEn: "Royal Blue", hex: "#2446A8", ralApprox: "RAL 5002", aliases: ["royal blue", "ρουα", "electric blue", "cobalt blue", "κοβαλτιο"] },
  { key: "sky-blue", displayNameEl: "Γαλάζιο", displayNameEn: "Sky Blue", hex: "#78B7DB", ralApprox: "RAL 5012", aliases: ["sky blue", "γαλαζιο", "light blue", "baby blue", "ανοιχτο μπλε", "σιελ", "ciel"] },
  { key: "turquoise", displayNameEl: "Τιρκουάζ", displayNameEn: "Turquoise", hex: "#33AAA5", ralApprox: "RAL 5018", cssName: "turquoise", aliases: ["turquoise", "τιρκουαζ", "aqua", "aquamarine", "ακουα"] },
  { key: "teal", displayNameEl: "Πετρόλ", displayNameEn: "Teal", hex: "#247779", ralApprox: "RAL 5021", cssName: "teal", aliases: ["teal", "πετρολ", "petrol", "blue green", "blue-green"] },
  { key: "green", displayNameEl: "Πράσινο", displayNameEn: "Green", hex: "#388A55", ralApprox: "RAL 6029", cssName: "green", aliases: ["green", "πρασινο", "prasino", "medium green"] },
  { key: "mint", displayNameEl: "Μέντα", displayNameEn: "Mint", hex: "#A9D7BC", ralApprox: "RAL 6019", aliases: ["mint", "mint green", "μεντα", "βεραμαν", "seafoam", "sea foam"] },
  { key: "olive", displayNameEl: "Λαδί", displayNameEn: "Olive", hex: "#69734A", ralApprox: "RAL 6003", cssName: "olive", aliases: ["olive", "olive green", "λαδι", "ελαιολαδι", "army green"] },
  { key: "khaki", displayNameEl: "Χακί", displayNameEn: "Khaki", hex: "#8C8458", ralApprox: "RAL 7008", cssName: "khaki", aliases: ["khaki", "χακι", "military", "military green"] },
  { key: "forest-green", displayNameEl: "Κυπαρισσί", displayNameEn: "Forest Green", hex: "#28523A", ralApprox: "RAL 6005", aliases: ["forest green", "κυπαρισσι", "dark green", "σκουρο πρασινο", "bottle green"] },
  { key: "lime", displayNameEl: "Λαχανί", displayNameEn: "Lime", hex: "#72B84C", ralApprox: "RAL 6018", cssName: "limegreen", aliases: ["lime", "lime green", "λαχανι", "bright green"] },
  { key: "natural", displayNameEl: "Φυσικό", displayNameEn: "Natural", hex: "#D8CDB8", aliases: ["natural", "φυσικο", "natural colour", "natural color", "undyed", "unbleached"] },
  { key: "wood", displayNameEl: "Ξύλο", displayNameEn: "Wood", hex: "#A8794F", aliases: ["wood", "wooden", "ξυλο", "wood colour", "wood color", "oak", "δρυς"] },
  { key: "stainless", displayNameEl: "Ανοξείδωτο", displayNameEn: "Stainless Steel", hex: "#B7B9B6", ralApprox: "RAL 9006", aliases: ["stainless", "stainless steel", "inox", "ανοξειδωτο", "ινoξ", "inox steel"] },
  { key: "transparent", displayNameEl: "Διάφανο", displayNameEn: "Transparent", hex: "#FFFFFF", swatchKind: "transparent", aliases: ["transparent", "clear", "διαφανο", "διαφανες", "clear transparent"] },
  { key: "multicolor", displayNameEl: "Πολύχρωμο", displayNameEn: "Multicolor", hex: "#B36CA8", swatchKind: "multicolor", aliases: ["multicolor", "multi color", "multi-color", "multicolour", "multi colour", "πολυχρωμο", "πολυχρωμα", "assorted", "mixed colours", "mixed colors"] }
] as const;


/**
 * Fine-grained shade references used by Color Finder Studios. These do not
 * create extra storefront filter facets: every shade points back to one
 * canonical CATALOG_COLOR_INDEX family.
 *
 * The HEX values are curated discovery references, not manufacturer claims.
 * Manufacturer/source HEX always wins when one is available.
 */
export const CATALOG_SHADE_REFERENCES: readonly CatalogShadeReference[] = [
  { key: "cherry", familyKey: "red", displayNameEl: "Κερασί", displayNameEn: "Cherry", hex: "#B31B34", aliases: ["cherry", "κερασι", "cherry red"] },
  { key: "berry", familyKey: "pink", displayNameEl: "Berry", displayNameEn: "Berry", hex: "#8F3155", aliases: ["berry", "berries", "berry pink", "berry red"] },
  { key: "scarlet", familyKey: "red", displayNameEl: "Scarlet", displayNameEn: "Scarlet", hex: "#C8323E", aliases: ["scarlet", "rouge"] },
  { key: "terracotta", familyKey: "orange", displayNameEl: "Τερακότα", displayNameEn: "Terracotta", hex: "#B95F4B", aliases: ["terracotta", "τερακοτα"] },
  { key: "magenta", familyKey: "fuchsia", displayNameEl: "Ματζέντα", displayNameEn: "Magenta", hex: "#C83278", aliases: ["magenta", "ματζεντα"] },
  { key: "rosewood", familyKey: "blush", displayNameEl: "Rosewood", displayNameEn: "Rosewood", hex: "#9B4E5E", aliases: ["rosewood", "rose wood"] },
  { key: "dusty-rose", familyKey: "blush", displayNameEl: "Dusty Rose", displayNameEn: "Dusty Rose", hex: "#B77A86", aliases: ["dusty rose", "old rose"] },
  { key: "rose", familyKey: "pink", displayNameEl: "Rose", displayNameEn: "Rose", hex: "#C96878", aliases: ["rose", "rose pink", "ροζ rose"] },
  { key: "pearly-pink", familyKey: "pink", displayNameEl: "Περλέ ροζ", displayNameEn: "Pearly Pink", hex: "#D998A8", aliases: ["pearly pink", "pearl pink", "περλε ροζ"] },
  { key: "mauve", familyKey: "purple", displayNameEl: "Mauve", displayNameEn: "Mauve", hex: "#9C687B", aliases: ["mauve", "μοβ ροζ"] },
  { key: "plum", familyKey: "purple", displayNameEl: "Δαμασκηνί", displayNameEn: "Plum", hex: "#70405A", aliases: ["plum", "δαμασκηνι"] },
  { key: "cobalt", familyKey: "royal-blue", displayNameEl: "Κοβαλτίου", displayNameEn: "Cobalt", hex: "#2D52A0", aliases: ["cobalt", "cobalt blue", "κοβαλτιο"] },
  { key: "denim", familyKey: "blue", displayNameEl: "Denim", displayNameEn: "Denim", hex: "#4F6B8A", aliases: ["denim", "denim blue"] },
  { key: "midnight", familyKey: "navy", displayNameEl: "Midnight Blue", displayNameEn: "Midnight Blue", hex: "#28314E", aliases: ["midnight", "midnight blue"] },
  { key: "emerald", familyKey: "green", displayNameEl: "Σμαραγδί", displayNameEn: "Emerald", hex: "#2D7657", aliases: ["emerald", "emerald green", "σμαραγδι"] },
  { key: "chestnut", familyKey: "brown", displayNameEl: "Καστανό", displayNameEn: "Chestnut", hex: "#7A4B37", aliases: ["chestnut", "καστανο", "κασταν"] },
  { key: "copper", familyKey: "tan", displayNameEl: "Χάλκινο", displayNameEn: "Copper", hex: "#B7673C", aliases: ["copper", "χαλκινο", "χαλκ"] },
  { key: "bronze", familyKey: "brown", displayNameEl: "Μπρονζέ", displayNameEn: "Bronze", hex: "#A97142", aliases: ["bronze", "μπρονζε", "μπρονζ"] },
  { key: "blonde", familyKey: "gold", displayNameEl: "Ξανθό", displayNameEn: "Blonde", hex: "#D6B77A", aliases: ["blonde", "blond", "ξανθο", "ξανθ"] },
  { key: "ash", familyKey: "grey", displayNameEl: "Σταχτί", displayNameEn: "Ash", hex: "#8A8178", aliases: ["ash", "ashy", "σταχτι", "σταχτ"] },
  { key: "ecru", familyKey: "off-white", displayNameEl: "Εκρού", displayNameEn: "Ecru", hex: "#D8C9AB", aliases: ["ecru", "εκρου"] },
  { key: "cognac", familyKey: "tan", displayNameEl: "Κονιάκ", displayNameEn: "Cognac", hex: "#9A5C32", aliases: ["cognac", "κονιακ"] },
  { key: "rust", familyKey: "orange", displayNameEl: "Σκουριά", displayNameEn: "Rust", hex: "#A65432", aliases: ["rust", "rusty", "σκουρια"] },
  { key: "mocha", familyKey: "brown", displayNameEl: "Μόκα", displayNameEn: "Mocha", hex: "#846257", aliases: ["mocha", "μοκα"] },
  { key: "caramel", familyKey: "tan", displayNameEl: "Καραμέλα", displayNameEn: "Caramel", hex: "#A8704F", aliases: ["caramel", "καραμελα"] },
  { key: "champagne", familyKey: "gold", displayNameEl: "Σαμπανί", displayNameEn: "Champagne", hex: "#D5BE92", aliases: ["champagne", "σαμπανι"] },
  { key: "milky", familyKey: "off-white", displayNameEl: "Γαλακτερό", displayNameEn: "Milky", hex: "#E9D9D5", aliases: ["milky", "milky white", "γαλακτερο"] }
] as const;

export function normalizeCatalogHex(value: string): `#${string}` | undefined {
  const clean = value.trim();
  const short = clean.match(/^#?([0-9a-f]{3})$/i);
  if (short) {
    return `#${short[1].split("").map((part) => part + part).join("").toUpperCase()}` as `#${string}`;
  }
  const full = clean.match(/^#?([0-9a-f]{6})$/i);
  return full ? `#${full[1].toUpperCase()}` as `#${string}` : undefined;
}

function extractCatalogHex(value: string): `#${string}` | undefined {
  const direct = normalizeCatalogHex(value);
  if (direct) return direct;
  const embedded = value.match(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i);
  return embedded ? normalizeCatalogHex(embedded[0]) : undefined;
}

export function normalizeCatalogColorText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ] as const;
}

function srgbCatalogChannel(value: number): number {
  const n = value / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

export function catalogHexToLab(hex: string): CatalogLabColor {
  const normalized = normalizeCatalogHex(hex);
  if (!normalized) throw new Error("Invalid HEX color");
  const [red, green, blue] = hexToRgb(normalized);
  const r = srgbCatalogChannel(red);
  const g = srgbCatalogChannel(green);
  const b = srgbCatalogChannel(blue);

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

  const pivot = (value: number) => value > 0.008856451679
    ? Math.cbrt(value)
    : (7.787037037 * value) + (16 / 116);
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);

  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

const catalogRadians = (degrees: number) => degrees * Math.PI / 180;
const catalogDegrees = (radiansValue: number) => radiansValue * 180 / Math.PI;

export function catalogDeltaE2000(left: CatalogLabColor, right: CatalogLabColor): number {
  const avgL = (left.l + right.l) / 2;
  const c1 = Math.sqrt(left.a * left.a + left.b * left.b);
  const c2 = Math.sqrt(right.a * right.a + right.b * right.b);
  const avgC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1 = (1 + g) * left.a;
  const a2 = (1 + g) * right.a;
  const c1p = Math.sqrt(a1 * a1 + left.b * left.b);
  const c2p = Math.sqrt(a2 * a2 + right.b * right.b);
  const h1 = ((catalogDegrees(Math.atan2(left.b, a1)) % 360) + 360) % 360;
  const h2 = ((catalogDegrees(Math.atan2(right.b, a2)) % 360) + 360) % 360;

  const dL = right.l - left.l;
  const dC = c2p - c1p;
  let dh = h2 - h1;
  if (c1p * c2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(catalogRadians(dh / 2));

  const avgLp = (left.l + right.l) / 2;
  const avgCp = (c1p + c2p) / 2;
  let avgHp = h1 + h2;
  if (c1p * c2p === 0) avgHp = h1 + h2;
  else if (Math.abs(h1 - h2) <= 180) avgHp = (h1 + h2) / 2;
  else if (h1 + h2 < 360) avgHp = (h1 + h2 + 360) / 2;
  else avgHp = (h1 + h2 - 360) / 2;

  const t = 1
    - 0.17 * Math.cos(catalogRadians(avgHp - 30))
    + 0.24 * Math.cos(catalogRadians(2 * avgHp))
    + 0.32 * Math.cos(catalogRadians(3 * avgHp + 6))
    - 0.20 * Math.cos(catalogRadians(4 * avgHp - 63));
  const deltaTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * t;
  const rt = -Math.sin(catalogRadians(2 * deltaTheta)) * rc;

  const lTerm = dL / sl;
  const cTerm = dC / sc;
  const hTerm = dH / sh;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm);
}

export function nearestCatalogShadeByHex(value: string): Readonly<{
  key: string;
  familyKey: string;
  displayNameEl: string;
  displayNameEn: string;
  referenceHex: `#${string}`;
  deltaE: number;
}> | undefined {
  const normalized = normalizeCatalogHex(value);
  if (!normalized) return undefined;
  const target = catalogHexToLab(normalized);
  const candidates = [
    ...CATALOG_SHADE_REFERENCES.map((entry) => ({
      key: entry.key,
      familyKey: entry.familyKey,
      displayNameEl: entry.displayNameEl,
      displayNameEn: entry.displayNameEn,
      referenceHex: entry.hex
    })),
    ...CATALOG_COLOR_INDEX
      .filter((entry) => (entry.swatchKind ?? "solid") === "solid")
      .map((entry) => ({
        key: entry.key,
        familyKey: entry.key,
        displayNameEl: entry.displayNameEl,
        displayNameEn: entry.displayNameEn,
        referenceHex: entry.hex
      }))
  ];

  let best: (typeof candidates)[number] & { deltaE: number } | undefined;
  for (const candidate of candidates) {
    const deltaE = catalogDeltaE2000(target, catalogHexToLab(candidate.referenceHex));
    if (!best || deltaE < best.deltaE) best = { ...candidate, deltaE };
  }
  return best;
}

function rgbToHsl([rRaw, gRaw, bRaw]: readonly [number, number, number]): string {
  const r = rRaw / 255;
  const g = gRaw / 255;
  const b = bRaw / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * (((b - r) / delta) + 2);
    else hue = 60 * (((r - g) / delta) + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs((2 * lightness) - 1));
  return `${Math.round(hue)}°, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%`;
}

function rgbToCmyk([rRaw, gRaw, bRaw]: readonly [number, number, number]): string {
  const r = rRaw / 255;
  const g = gRaw / 255;
  const b = bRaw / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999) return "0%, 0%, 0%, 100%";
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return `${Math.round(c * 100)}%, ${Math.round(m * 100)}%, ${Math.round(y * 100)}%, ${Math.round(k * 100)}%`;
}

function colorSearchTokens(entry: CatalogColorIndexEntry): readonly string[] {
  return [entry.key, entry.displayNameEl, entry.displayNameEn, entry.hex, entry.ralApprox ?? "", ...entry.aliases]
    .map(normalizeCatalogColorText)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

/** True when two source colour values resolve to the same shopper-facing colour. */
export function catalogColorMatches(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftText = left.trim();
  const rightText = right.trim();
  if (!leftText || !rightText) return false;
  const leftResolved = resolveCatalogColor(leftText);
  const rightResolved = resolveCatalogColor(rightText);
  if (leftResolved && rightResolved) return leftResolved.key === rightResolved.key;
  return normalizeCatalogColorText(leftText) === normalizeCatalogColorText(rightText);
}

/**
 * Returns the normalized values that may represent one shopper-facing colour in
 * persisted catalogue projections. Storefront filters use these aliases so source
 * values such as "Navy Blue", "Σκούρο Μπλε" and the canonical key "navy" resolve
 * to the same colour facet.
 */
export function catalogColorFilterValues(value: unknown): readonly string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const source = value.trim();
  const resolved = resolveCatalogColor(source);
  if (!resolved) {
    const raw = source.toLocaleLowerCase("el");
    const normalized = normalizeCatalogColorText(source);
    return [...new Set([raw, normalized].filter(Boolean))];
  }

  const entry = CATALOG_COLOR_INDEX.find((candidate) => candidate.key === resolved.key);
  if (!entry) return [resolved.key];

  return [...new Set([
    source,
    entry.key,
    entry.displayNameEl,
    entry.displayNameEn,
    entry.hex,
    entry.ralApprox ?? "",
    entry.cssName ?? "",
    ...entry.aliases
  ].flatMap((candidate) => {
    const raw = candidate.trim().toLocaleLowerCase("el");
    const normalized = normalizeCatalogColorText(candidate);
    return [raw, normalized];
  }).filter(Boolean))];
}

function shadeSearchTokens(entry: CatalogShadeReference): readonly string[] {
  return [entry.key, entry.displayNameEl, entry.displayNameEn, entry.hex, ...entry.aliases]
    .map(normalizeCatalogColorText)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function resolvedShadeFromReference(
  sourceValue: string,
  entry: CatalogShadeReference,
  alias: string
): ResolvedCatalogShade {
  return {
    key: entry.key,
    familyKey: entry.familyKey,
    displayNameEl: entry.displayNameEl,
    displayNameEn: entry.displayNameEn,
    sourceValue,
    matchedAlias: alias,
    hex: entry.hex,
    precision: "reference"
  };
}

/**
 * Resolves a fine shade for perceptual Studio matching while retaining the
 * canonical storefront family. Explicit source HEX is never replaced by an
 * approximation. Otherwise the longest known shade/family alias wins.
 */
export function resolveCatalogShade(value: unknown): ResolvedCatalogShade | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const sourceValue = value.trim();
  const explicitHex = extractCatalogHex(sourceValue);
  if (explicitHex) {
    const exactReference = CATALOG_SHADE_REFERENCES.find((entry) => entry.hex.toUpperCase() === explicitHex.toUpperCase());
    if (exactReference) {
      return {
        ...resolvedShadeFromReference(sourceValue, exactReference, explicitHex),
        hex: explicitHex,
        precision: "exact"
      };
    }
    const exactFamily = CATALOG_COLOR_INDEX.find((entry) => entry.hex.toUpperCase() === explicitHex.toUpperCase());
    const nearest = exactFamily ? undefined : nearestCatalogShadeByHex(explicitHex);
    return {
      key: exactFamily?.key ?? nearest?.key ?? explicitHex.toLowerCase(),
      familyKey: exactFamily?.key ?? nearest?.familyKey,
      displayNameEl: exactFamily?.displayNameEl ?? nearest?.displayNameEl ?? explicitHex,
      displayNameEn: exactFamily?.displayNameEn ?? nearest?.displayNameEn ?? explicitHex,
      sourceValue,
      matchedAlias: explicitHex,
      hex: explicitHex,
      precision: "exact"
    };
  }

  const normalized = normalizeCatalogColorText(sourceValue);
  if (!normalized) return undefined;

  const candidates = [
    ...CATALOG_SHADE_REFERENCES.flatMap((entry) =>
      shadeSearchTokens(entry).map((alias) => ({ kind: "reference" as const, entry, alias }))
    ),
    ...CATALOG_COLOR_INDEX.flatMap((entry) =>
      colorSearchTokens(entry).map((alias) => ({ kind: "family" as const, entry, alias }))
    )
  ];

  const exact = candidates.find((candidate) => candidate.alias === normalized);
  const haystack = ` ${normalized} `;
  const matched = exact ?? candidates
    .filter(({ alias }) => alias.length >= 3 && haystack.includes(` ${alias} `))
    .sort((left, right) => right.alias.length - left.alias.length)[0];

  if (!matched) return undefined;
  if (matched.kind === "reference") {
    return resolvedShadeFromReference(sourceValue, matched.entry, matched.alias);
  }

  return {
    key: matched.entry.key,
    familyKey: matched.entry.key,
    displayNameEl: matched.entry.displayNameEl,
    displayNameEn: matched.entry.displayNameEn,
    sourceValue,
    matchedAlias: matched.alias,
    hex: matched.entry.hex,
    precision: "family"
  };
}

export function catalogColorFamilyKey(value: unknown): string | undefined {
  return resolveCatalogShade(value)?.familyKey ?? resolveCatalogColor(value)?.key;
}

export function resolveCatalogColor(value: unknown): ResolvedCatalogColor | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const sourceValue = value.trim();
  const normalized = normalizeCatalogColorText(sourceValue);
  if (!normalized) return undefined;

  let matched: { entry: CatalogColorIndexEntry; alias: string } | undefined;
  for (const entry of CATALOG_COLOR_INDEX) {
    const aliases = colorSearchTokens(entry);
    const exact = aliases.find((alias) => alias === normalized);
    if (exact) {
      matched = { entry, alias: exact };
      break;
    }
  }
  if (!matched) {
    const haystack = ` ${normalized} `;
    const candidates = CATALOG_COLOR_INDEX.flatMap((entry) => colorSearchTokens(entry).map((alias) => ({ entry, alias })))
      .filter(({ alias }) => alias.length >= 3 && haystack.includes(` ${alias} `))
      .sort((left, right) => right.alias.length - left.alias.length);
    matched = candidates[0];
  }
  if (!matched) {
    const shade = resolveCatalogShade(sourceValue);
    const familyEntry = shade?.familyKey
      ? CATALOG_COLOR_INDEX.find((entry) => entry.key === shade.familyKey)
      : undefined;
    if (shade && familyEntry) matched = { entry: familyEntry, alias: shade.matchedAlias };
  }
  if (!matched) return undefined;

  const rgb = hexToRgb(matched.entry.hex);
  return {
    key: matched.entry.key,
    displayNameEl: matched.entry.displayNameEl,
    displayNameEn: matched.entry.displayNameEn,
    sourceValue,
    matchedAlias: matched.alias,
    hex: matched.entry.hex,
    ralApprox: matched.entry.ralApprox,
    cssName: matched.entry.cssName,
    swatchKind: matched.entry.swatchKind ?? "solid",
    rgb,
    hsl: rgbToHsl(rgb),
    cmyk: rgbToCmyk(rgb)
  };
}
