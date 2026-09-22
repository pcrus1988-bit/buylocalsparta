export type PaintSurfaceKey =
  | "interior-wall"
  | "exterior-wall"
  | "wood"
  | "metal"
  | "bathroom"
  | "roof";

export type PaintMoodKey =
  | "bright"
  | "warm"
  | "natural"
  | "minimal"
  | "modern"
  | "bold";

export type PaintCondition = Readonly<{
  key: string;
  label: string;
  hint: string;
}>;

export type PaintSurface = Readonly<{
  key: PaintSurfaceKey;
  label: string;
  shortLabel: string;
  icon: string;
  intro: string;
  conditions: readonly PaintCondition[];
  defaultAreaM2: number;
  colourRelevant: boolean;
}>;

export type PaintMood = Readonly<{
  key: PaintMoodKey;
  label: string;
  hint: string;
  paletteName: string;
  colours: readonly string[];
}>;

export type PaintCatalogueCandidate = Readonly<{
  productId: string;
  productName: string;
  manufacturer?: string;
  href: string;
  colourHex?: string;
  colourName?: string;
  colourCode?: string;
  catalogueTags: readonly string[];
  surfaceKeys?: readonly PaintSurfaceKey[];
  conditionKeys?: readonly string[];
  finishLabel?: string;
  available?: boolean;
}>;

export type PaintCandidateMatch = Readonly<{
  candidate: PaintCatalogueCandidate;
  exactShade: boolean;
  colourDistance: number | null;
  compatibilityScore: number;
  matchReasons: readonly string[];
}>;

export type PaintRecommendation = Readonly<{
  surface: PaintSurface;
  condition: PaintCondition;
  systemName: string;
  topcoatLabel: string;
  finishLabel: string;
  primerRequired: boolean;
  primerLabel?: string;
  preparation: readonly string[];
  reasons: readonly string[];
  warnings: readonly string[];
  areaM2: number;
  quantityStatus: "requires_manufacturer_product";
  quantityNote: string;
  selectedColour: string;
  catalogueTags: readonly string[];
  searchHref: string;
}>;

export const PAINT_SURFACES: readonly PaintSurface[] = [
  {
    key: "interior-wall",
    label: "Εσωτερικός τοίχος",
    shortLabel: "Εσωτερικό",
    icon: "⌂",
    intro: "Σαλόνι, υπνοδωμάτιο, παιδικό δωμάτιο ή διάδρομος.",
    defaultAreaM2: 28,
    colourRelevant: true,
    conditions: [
      { key: "sound", label: "Καλή κατάσταση", hint: "Βαμμένος τοίχος χωρίς εμφανές πρόβλημα." },
      { key: "new-plaster", label: "Νέος σοβάς", hint: "Νέα ή πρόσφατα επιχρισμένη εσωτερική επιφάνεια." },
      { key: "new-gypsum", label: "Νέα γυψοσανίδα", hint: "Νέα γυψοσανίδα με ολοκληρωμένους αρμούς / στοκαρίσματα." },
      { key: "stains", label: "Λεκέδες", hint: "Νικοτίνη, νερά, μαρκαδόροι ή επίμονα σημάδια." },
      { key: "damp", label: "Υγρασία / μούχλα", hint: "Σημάδια υγρασίας ή ανάπτυξη μούχλας." },
      { key: "hairline-cracks", label: "Τριχοειδείς ρωγμές", hint: "Λεπτές ρωγμές που χρειάζονται έλεγχο και επισκευή πριν τη βαφή." },
      { key: "peeling", label: "Ξεφλούδισμα", hint: "Η παλιά βαφή αποκολλάται ή δεν είναι σταθερή." }
    ]
  },
  {
    key: "exterior-wall",
    label: "Εξωτερικός τοίχος",
    shortLabel: "Εξωτερικό",
    icon: "☀",
    intro: "Όψη, μπαλκόνι, μάντρα ή άλλη επιφάνεια που εκτίθεται στον καιρό.",
    defaultAreaM2: 45,
    colourRelevant: true,
    conditions: [
      { key: "sound", label: "Καλή κατάσταση", hint: "Σταθερή υπάρχουσα βαφή." },
      { key: "new", label: "Νέος σοβάς", hint: "Άβαφη ή πρόσφατα επιχρισμένη επιφάνεια." },
      { key: "chalking", label: "Σκόνη / κιμωλία", hint: "Η παλιά βαφή αφήνει σκόνη στο χέρι." },
      { key: "damp", label: "Υγρασία", hint: "Τοίχος με επιβάρυνση από νερό ή υγρασία." },
      { key: "cracks", label: "Τριχοειδείς ρωγμές", hint: "Λεπτές ρωγμές που χρειάζονται αξιολόγηση πριν από νέα βαφή." }
    ]
  },
  {
    key: "wood",
    label: "Ξύλο",
    shortLabel: "Ξύλο",
    icon: "▥",
    intro: "Πόρτες, κουφώματα, έπιπλα, πέργκολες ή ξύλινες κατασκευές.",
    defaultAreaM2: 12,
    colourRelevant: true,
    conditions: [
      { key: "bare", label: "Άβαφο ξύλο", hint: "Καθαρή ξύλινη επιφάνεια χωρίς προηγούμενο φινίρισμα." },
      { key: "painted", label: "Ήδη βαμμένο", hint: "Υπάρχει σταθερό παλιό χρώμα ή βερνίκι." },
      { key: "weathered", label: "Ταλαιπωρημένο", hint: "Ξεθωριασμένο, πορώδες ή εκτεθειμένο στις καιρικές συνθήκες." }
    ]
  },
  {
    key: "metal",
    label: "Σίδερο / χάλυβας",
    shortLabel: "Σίδερο",
    icon: "◇",
    intro: "Κάγκελα, πόρτες και κατασκευές από σίδερο ή κοινό χάλυβα. Γαλβανιζέ και αλουμίνιο χρειάζονται ξεχωριστό workflow.",
    defaultAreaM2: 10,
    colourRelevant: true,
    conditions: [
      { key: "bare", label: "Άβαφο σίδερο / χάλυβας", hint: "Γυμνή σιδηρούχα επιφάνεια χωρίς προηγούμενη βαφή." },
      { key: "painted", label: "Ήδη βαμμένο", hint: "Υπάρχει σταθερή προηγούμενη βαφή σε σίδερο / χάλυβα." },
      { key: "rust", label: "Έχει σκουριά", hint: "Υπάρχει διάβρωση που πρέπει να αξιολογηθεί και να προετοιμαστεί πριν το νέο coating." }
    ]
  },
  {
    key: "bathroom",
    label: "Μπάνιο / υγρασία",
    shortLabel: "Μπάνιο",
    icon: "◌",
    intro: "Τοίχος ή οροφή σε χώρο με υψηλή υγρασία και συχνή συμπύκνωση.",
    defaultAreaM2: 18,
    colourRelevant: true,
    conditions: [
      { key: "sound", label: "Καλή κατάσταση", hint: "Δεν υπάρχει ενεργό πρόβλημα υγρασίας." },
      { key: "damp", label: "Υγρασία", hint: "Υπάρχουν σημάδια υγρασίας ή συμπύκνωσης." },
      { key: "mould", label: "Μούχλα", hint: "Υπάρχουν μαύρα ή πράσινα σημάδια μούχλας." }
    ]
  },
  {
    key: "roof",
    label: "Ταράτσα / στεγανοποίηση",
    shortLabel: "Ταράτσα",
    icon: "▱",
    intro: "Δώμα ή ταράτσα που χρειάζεται προστασία από νερό και καιρικές καταπονήσεις.",
    defaultAreaM2: 60,
    colourRelevant: false,
    conditions: [
      { key: "maintenance", label: "Συντήρηση", hint: "Υπάρχει παλιό σύστημα που χρειάζεται ανανέωση." },
      { key: "new", label: "Νέα στεγανοποίηση", hint: "Χρειάζεται νέα λύση στεγανοποίησης μετά από έλεγχο υποστρώματος και λεπτομερειών." },
      { key: "cracks", label: "Ρωγμές / αρμοί", hint: "Υπάρχουν σημεία που χρειάζονται επισκευή πριν τη στεγάνωση." }
    ]
  }
] as const;

export const PAINT_MOODS: readonly PaintMood[] = [
  {
    key: "bright",
    label: "Φωτεινό",
    hint: "Απαλό, καθαρό και με περισσότερο φως.",
    paletteName: "Soft Light",
    colours: ["#F4F0E7", "#E8E1D3", "#D8D5CC"]
  },
  {
    key: "warm",
    label: "Ζεστό",
    hint: "Φιλόξενο, ήρεμο και πιο cosy.",
    paletteName: "Warm Mediterranean",
    colours: ["#D8C1A7", "#C69A75", "#A97B61"]
  },
  {
    key: "natural",
    label: "Φυσικό",
    hint: "Γήινες και φυτικές αποχρώσεις.",
    paletteName: "Natural Calm",
    colours: ["#B8B29A", "#8E9A7D", "#C8A98D"]
  },
  {
    key: "minimal",
    label: "Minimal",
    hint: "Greige, stone και ήσυχες ουδέτερες αποχρώσεις.",
    paletteName: "Soft Minimal",
    colours: ["#D9D3C8", "#BEB6AA", "#A59D92"]
  },
  {
    key: "modern",
    label: "Σύγχρονο",
    hint: "Καθαρή αντίθεση και πιο αρχιτεκτονικό αποτέλεσμα.",
    paletteName: "Modern Contrast",
    colours: ["#E8E6E1", "#7A7D78", "#3E4548"]
  },
  {
    key: "bold",
    label: "Με χαρακτήρα",
    hint: "Πιο έντονο χρώμα και statement αποτέλεσμα.",
    paletteName: "Bold Edit",
    colours: ["#A94E3C", "#315C67", "#80623C"]
  }
] as const;

function surfaceByKey(key: PaintSurfaceKey): PaintSurface {
  return PAINT_SURFACES.find((surface) => surface.key === key) ?? PAINT_SURFACES[0];
}

function conditionByKey(surface: PaintSurface, key: string): PaintCondition {
  return surface.conditions.find((condition) => condition.key === key) ?? surface.conditions[0];
}

function normalizedHex(value: string | undefined): string | undefined {
  if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) return undefined;
  return value.toUpperCase();
}

function rgbDistance(a: string, b: string): number {
  const channels = (hex: string) => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ] as const;
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

export function findCompatiblePaintCandidates(
  recommendation: PaintRecommendation,
  candidates: readonly PaintCatalogueCandidate[],
  options: Readonly<{ maxColourDistance?: number }> = {}
): readonly PaintCandidateMatch[] {
  const wantedColour = normalizedHex(recommendation.selectedColour);
  const maxColourDistance = options.maxColourDistance ?? 42;
  const requiredTags = new Set(recommendation.catalogueTags.map((tag) => tag.toLocaleLowerCase("el")));

  return candidates
    .flatMap((candidate) => {
      if (candidate.available === false) return [];
      if (candidate.surfaceKeys?.length && !candidate.surfaceKeys.includes(recommendation.surface.key)) return [];
      if (candidate.conditionKeys?.length && !candidate.conditionKeys.includes(recommendation.condition.key)) return [];

      const candidateTags = candidate.catalogueTags.map((tag) => tag.toLocaleLowerCase("el"));
      const matchedTags = candidateTags.filter((tag) => requiredTags.has(tag));
      if (!matchedTags.length) return [];

      const candidateColour = normalizedHex(candidate.colourHex);
      const colourDistance = wantedColour && candidateColour ? rgbDistance(wantedColour, candidateColour) : null;
      const exactShade = colourDistance === 0;
      if (colourDistance !== null && colourDistance > maxColourDistance) return [];

      const compatibilityScore =
        matchedTags.length * 10 +
        (exactShade ? 8 : colourDistance !== null ? Math.max(0, 6 - colourDistance / 10) : 0) +
        (candidate.finishLabel === recommendation.finishLabel ? 2 : 0);

      const matchReasons = [
        `${matchedTags.length} τεχνικές απαιτήσεις ταιριάζουν`,
        exactShade
          ? "Ίδια ψηφιακή απόχρωση"
          : colourDistance !== null
            ? "Κοντινή ψηφιακή απόχρωση"
            : "Η απόχρωση θα επιβεβαιωθεί από τη χρωματολόγηση του κατασκευαστή"
      ];

      return [{
        candidate,
        exactShade,
        colourDistance,
        compatibilityScore,
        matchReasons
      }];
    })
    .sort((a, b) =>
      Number(b.exactShade) - Number(a.exactShade) ||
      b.compatibilityScore - a.compatibilityScore ||
      (a.colourDistance ?? Number.MAX_SAFE_INTEGER) - (b.colourDistance ?? Number.MAX_SAFE_INTEGER) ||
      a.candidate.productName.localeCompare(b.candidate.productName, "el")
    );
}

/**
 * Legacy Paint Consultant presentation envelope only.
 *
 * Technical preparation, primer/topcoat/system selection, warnings and suitability
 * must come from the reviewed Layer A + verified Layer B + Layer C runtime. This
 * helper intentionally carries no technical prescription.
 */
function systemFor(surface: PaintSurface, _condition: PaintCondition) {
  return {
    systemName: surface.key === "roof" ? "Έλεγχος στεγανοποίησης" : "Έλεγχος βαφής",
    topcoatLabel: "",
    finishLabel: "",
    primerRequired: false,
    primerLabel: undefined as string | undefined,
    preparation: [] as readonly string[],
    reasons: [] as readonly string[],
    warnings: [] as readonly string[],
    tags: [] as readonly string[]
  } as const;
}

/**
 * Retrieval-only vocabulary for broad catalogue discovery.
 *
 * These terms are NOT technical eligibility rules. A product may appear in the
 * customer chooser only after the candidates endpoint independently verifies a
 * current manufacturer product/profile/rule/evidence match for the reviewed
 * scenario and facts. Do not add primer chemistry, coating technology or other
 * prescriptive system assumptions here.
 */
export function paintDiscoveryTerms(surfaceKey: PaintSurfaceKey): readonly string[] {
  switch (surfaceKey) {
    case "interior-wall": return ["χρώμα εσωτερικού", "εσωτερικού χώρου"];
    case "exterior-wall": return ["χρώμα εξωτερικού", "εξωτερικού χώρου"];
    case "wood": return ["χρώμα ξύλου", "ξύλο"];
    case "metal": return ["χρώμα μετάλλου", "μέταλλο"];
    case "bathroom": return ["χρώμα μπάνιου", "μπάνιο"];
    case "roof": return ["στεγανοποίηση ταράτσας", "ταράτσα"];
  }
}

export function recommendPaintProject(input: {
  surfaceKey: PaintSurfaceKey;
  conditionKey: string;
  areaM2: number;
  selectedColour: string;
}): PaintRecommendation {
  const surface = surfaceByKey(input.surfaceKey);
  const condition = conditionByKey(surface, input.conditionKey);
  const system = systemFor(surface, condition);
  const areaM2 = Math.min(1000, Math.max(1, Number.isFinite(input.areaM2) ? input.areaM2 : surface.defaultAreaM2));
  const selectedColour = /^#[0-9A-Fa-f]{6}$/.test(input.selectedColour)
    ? input.selectedColour.toUpperCase()
    : "#F4F0E7";

  const quantityNote =
    "Η τεχνική καθοδήγηση, η επιλεξιμότητα προϊόντων και η ποσότητα προκύπτουν μόνο από την ελεγμένη διαδρομή Layer A + Layer B + Layer C και τα επίσημα στοιχεία του επιλεγμένου κατασκευαστή.";


  return {
    surface,
    condition,
    systemName: system.systemName,
    topcoatLabel: system.topcoatLabel,
    finishLabel: system.finishLabel,
    primerRequired: system.primerRequired,
    primerLabel: system.primerLabel,
    preparation: system.preparation,
    reasons: system.reasons,
    warnings: system.warnings,
    areaM2,
    quantityStatus: "requires_manufacturer_product",
    quantityNote,
    selectedColour,
    catalogueTags: system.tags,
    searchHref: "/shop"
  };
}

export function paintSurface(key: PaintSurfaceKey): PaintSurface {
  return surfaceByKey(key);
}

export function paintMood(key: PaintMoodKey): PaintMood {
  return PAINT_MOODS.find((mood) => mood.key === key) ?? PAINT_MOODS[0];
}
