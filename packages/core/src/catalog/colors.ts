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
