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
      { key: "new", label: "Καινούριος / άβαφος", hint: "Σοβάς, γυψοσανίδα ή νέα επιφάνεια." },
      { key: "stains", label: "Λεκέδες", hint: "Νικοτίνη, νερά, μαρκαδόροι ή επίμονα σημάδια." },
      { key: "damp", label: "Υγρασία / μούχλα", hint: "Σημάδια υγρασίας ή ανάπτυξη μούχλας." },
      { key: "cracks", label: "Ρωγμές / ξεφλούδισμα", hint: "Η επιφάνεια χρειάζεται επισκευή πριν τη βαφή." }
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
      { key: "cracks", label: "Τριχοειδείς ρωγμές", hint: "Χρειάζεται ελαστικότητα και προεργασία." }
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
      { key: "new", label: "Νέα στεγανοποίηση", hint: "Θέλεις νέο υγρό σύστημα στεγανοποίησης." },
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

function systemFor(surface: PaintSurface, condition: PaintCondition) {
  const warnings: string[] = [];
  const preparation: string[] = [];
  const reasons: string[] = [];
  let primerRequired = false;
  let primerLabel: string | undefined;
  let topcoatLabel = "";
  let finishLabel = "Ματ";
  let systemName = "";
  let tags: string[] = [];

  switch (surface.key) {
    case "interior-wall": {
      systemName = "Σύστημα βαφής εσωτερικού τοίχου";
      topcoatLabel = "Πλενόμενο χρώμα εσωτερικού χώρου";
      finishLabel = "Ματ / χαμηλής γυαλάδας";
      tags = ["χρώμα εσωτερικού", "πλενόμενο", "ματ"];

      if (condition.key === "new") {
        primerRequired = true;
        primerLabel = "Ακρυλικό αστάρι νερού για νέα / πορώδη επιφάνεια";
        preparation.push("Καθάρισμα σκόνης και σαθρών υλικών", "Αστάρωμα πριν την τελική βαφή");
        reasons.push("Η νέα επιφάνεια χρειάζεται ομοιόμορφη απορροφητικότητα.");
      } else if (condition.key === "stains") {
        primerRequired = true;
        primerLabel = "Μονωτικό αστάρι λεκέδων";
        preparation.push("Καθαρισμός λεκέδων", "Τοπική ή πλήρης εφαρμογή μονωτικού ασταριού");
        reasons.push("Οι επίμονοι λεκέδες μπορεί να επανεμφανιστούν μέσα από το νέο χρώμα.");
        tags.push("μονωτικό λεκέδων");
      } else if (condition.key === "damp") {
        primerRequired = true;
        primerLabel = "Κατάλληλο αστάρι μετά την αποκατάσταση της αιτίας υγρασίας";
        preparation.push("Εντοπισμός και αποκατάσταση της πηγής υγρασίας", "Πλήρες στέγνωμα", "Καθαρισμός / εξυγίανση της επιφάνειας");
        reasons.push("Η βαφή πρέπει να γίνει μόνο αφού σταματήσει η ενεργή υγρασία.");
        warnings.push("Μην εγκλωβίσεις ενεργή υγρασία κάτω από νέα βαφή. Αν η αιτία δεν είναι σαφής, χρειάζεται τεχνικός έλεγχος.");
        tags.push("αντοχή υγρασία");
      } else if (condition.key === "cracks") {
        primerRequired = true;
        primerLabel = "Αστάρι σταθεροποίησης μετά τις επισκευές";
        preparation.push("Αφαίρεση σαθρών σημείων", "Στοκάρισμα / επισκευή ρωγμών", "Τρίψιμο και αστάρωμα");
        reasons.push("Οι ρωγμές και το ξεφλούδισμα πρέπει να σταθεροποιηθούν πριν το τελικό χρώμα.");
        tags.push("στόκος", "αστάρι");
      } else {
        preparation.push("Καθαρισμός της επιφάνειας και ελαφρύ τρίψιμο όπου χρειάζεται");
        reasons.push("Η σταθερή υπάρχουσα βαφή μπορεί συνήθως να δεχτεί νέο σύστημα μετά από σωστή προετοιμασία.");
      }
      break;
    }

    case "exterior-wall": {
      systemName = "Σύστημα προστασίας εξωτερικού τοίχου";
      topcoatLabel = condition.key === "cracks"
        ? "Ελαστομερές / υψηλής ελαστικότητας χρώμα εξωτερικού"
        : "Ακρυλικό ή σιλικονούχο χρώμα εξωτερικού";
      finishLabel = "Ματ";
      tags = ["χρώμα εξωτερικού", "ακρυλικό", "αντοχή UV"];

      if (condition.key === "new") {
        primerRequired = true;
        primerLabel = "Ακρυλικό αστάρι εξωτερικού για νέο σοβά";
        preparation.push("Έλεγχος ωρίμανσης νέου σοβά", "Καθαρισμός", "Αστάρωμα");
        reasons.push("Ο νέος σοβάς χρειάζεται σταθεροποίηση και έλεγχο απορροφητικότητας.");
      } else if (condition.key === "chalking") {
        primerRequired = true;
        primerLabel = "Διεισδυτικό / σταθεροποιητικό αστάρι εξωτερικού";
        preparation.push("Πλύσιμο και απομάκρυνση κιμωλίασης", "Αστάρωμα σταθεροποίησης");
        reasons.push("Η κιμωλίαση μειώνει σημαντικά την πρόσφυση της νέας βαφής.");
      } else if (condition.key === "damp") {
        primerRequired = true;
        primerLabel = "Αστάρι εξωτερικού μετά την επίλυση της υγρασίας";
        preparation.push("Έλεγχος εισροής νερού", "Επισκευή αιτίας", "Στέγνωμα", "Αστάρωμα");
        warnings.push("Η εξωτερική υγρασία μπορεί να προέρχεται από ρωγμές, αρμούς ή ανερχόμενη υγρασία. Η βαφή δεν υποκαθιστά την επισκευή.");
        reasons.push("Η στεγνή και σταθερή βάση είναι προϋπόθεση για ανθεκτικό τελικό αποτέλεσμα.");
      } else if (condition.key === "cracks") {
        primerRequired = true;
        primerLabel = "Αστάρι εξωτερικού συμβατό με ελαστομερές σύστημα";
        preparation.push("Άνοιγμα / καθαρισμός προβληματικών ρωγμών", "Ελαστικό υλικό επισκευής", "Αστάρωμα");
        reasons.push("Οι τριχοειδείς ρωγμές χρειάζονται σύστημα με μεγαλύτερη ελαστικότητα.");
        tags.push("ελαστομερές");
      } else {
        preparation.push("Πλύσιμο, αφαίρεση σαθρών σημείων και πλήρες στέγνωμα");
        reasons.push("Η καθαρή και σταθερή επιφάνεια βοηθά τη νέα εξωτερική βαφή να αντέξει περισσότερο.");
      }
      break;
    }

    case "wood": {
      systemName = "Σύστημα βαφής / προστασίας ξύλου";
      topcoatLabel = "Βερνικόχρωμα ή προστατευτική βαφή ξύλου";
      finishLabel = "Σατινέ";
      tags = ["ξύλο", "βερνικόχρωμα", "προστασία ξύλου"];

      if (condition.key === "bare") {
        primerRequired = true;
        primerLabel = "Αστάρι / υπόστρωμα ξύλου";
        preparation.push("Λείανση κατά τη φορά των ινών", "Απομάκρυνση σκόνης", "Αστάρωμα ξύλου");
        reasons.push("Το άβαφο ξύλο χρειάζεται σφράγιση και ομοιόμορφη βάση πριν το τελικό φινίρισμα.");
      } else if (condition.key === "weathered") {
        primerRequired = true;
        primerLabel = "Κατάλληλο υπόστρωμα ξύλου μετά από βαθιά προετοιμασία";
        preparation.push("Αφαίρεση σαθρού παλιού φινιρίσματος", "Τρίψιμο", "Καθαρισμός", "Αστάρωμα");
        reasons.push("Η ταλαιπωρημένη επιφάνεια χρειάζεται αποκατάσταση πριν δεχτεί νέο φινίρισμα.");
      } else {
        preparation.push("Έλεγχος πρόσφυσης παλιάς βαφής", "Ελαφρύ τρίψιμο και καθαρισμός");
        reasons.push("Η ματ, καθαρή παλιά βαφή προσφέρει καλύτερη πρόσφυση στο νέο φινίρισμα.");
      }
      break;
    }

    case "metal": {
      systemName = "Σύστημα προστασίας σιδήρου / χάλυβα";
      topcoatLabel = "Ανθεκτικό βερνικόχρωμα μετάλλου";
      finishLabel = "Σατινέ / γυαλιστερό";
      tags = ["μέταλλο", "αντισκωριακό", "βερνικόχρωμα"];

      if (condition.key === "bare") {
        primerRequired = true;
        primerLabel = "Αστάρι / πρώτη στρώση όπως ορίζει το επιλεγμένο σύστημα προστασίας";
        preparation.push("Απολίπανση / καθαρισμός", "Προετοιμασία στον βαθμό που απαιτεί το επιλεγμένο σύστημα", "Πρώτη στρώση σύμφωνα με τον κατασκευαστή");
        reasons.push("Το γυμνό μέταλλο χρειάζεται αντιδιαβρωτική προστασία πριν το τελικό χρώμα.");
      } else if (condition.key === "rust") {
        primerRequired = true;
        primerLabel = "Πρώτη αντιδιαβρωτική στρώση σύμφωνα με το επιλεγμένο σύστημα μετά την προετοιμασία";
        preparation.push("Μηχανική απομάκρυνση σαθρής σκουριάς", "Απολίπανση", "Αντισκωριακό αστάρι");
        reasons.push("Η ενεργή σκουριά πρέπει να αντιμετωπιστεί πριν καλυφθεί.");
        warnings.push("Μην εφαρμόσεις τελικό χρώμα πάνω σε σαθρή ή ενεργή σκουριά.");
      } else {
        preparation.push("Έλεγχος πρόσφυσης παλιάς βαφής", "Τρίψιμο και απολίπανση");
        reasons.push("Η σωστή προετοιμασία της παλιάς βαφής μειώνει τον κίνδυνο αποκόλλησης.");
      }
      break;
    }

    case "bathroom": {
      systemName = "Σύστημα βαφής χώρου υψηλής υγρασίας";
      topcoatLabel = "Χρώμα εσωτερικού με αυξημένη αντοχή σε υγρασία και μούχλα";
      finishLabel = "Ματ / σατινέ";
      tags = ["μπάνιο", "αντοχή υγρασία", "αντιμουχλικό", "πλενόμενο"];

      if (condition.key === "mould") {
        primerRequired = true;
        primerLabel = "Κατάλληλο αστάρι μετά από καθαρισμό και εξυγίανση";
        preparation.push("Ασφαλής καθαρισμός μούχλας", "Πλήρες στέγνωμα", "Έλεγχος αερισμού / πηγής υγρασίας", "Αστάρωμα");
        reasons.push("Η μούχλα πρέπει να αφαιρεθεί και να ελεγχθεί η αιτία πριν τη νέα βαφή.");
        warnings.push("Επίμονη ή εκτεταμένη μούχλα μπορεί να υποδηλώνει πρόβλημα υγρασίας που απαιτεί τεχνικό έλεγχο.");
      } else if (condition.key === "damp") {
        primerRequired = true;
        primerLabel = "Αστάρι κατάλληλο για την αποκατεστημένη επιφάνεια";
        preparation.push("Έλεγχος αιτίας υγρασίας", "Στέγνωμα", "Καθαρισμός", "Αστάρωμα");
        reasons.push("Η ανθεκτική τελική βαφή λειτουργεί σωστά μόνο πάνω σε στεγνή βάση.");
        warnings.push("Αν υπάρχει διαρροή ή ενεργή εισροή νερού, λύσε πρώτα την αιτία.");
      } else {
        preparation.push("Καθαρισμός σαπουνιών / λιπαρών ρύπων και πλήρες στέγνωμα");
        reasons.push("Σε χώρους υγρασίας προτιμάται τελικό χρώμα με αυξημένη αντοχή σε πλύσιμο και συμπύκνωση.");
      }
      break;
    }

    case "roof": {
      systemName = "Υγρό σύστημα στεγανοποίησης ταράτσας";
      topcoatLabel = "Ελαστική στεγανωτική μεμβράνη ταράτσας";
      finishLabel = "Λευκό / ανακλαστικό όπου υποστηρίζεται";
      tags = ["στεγανοποίηση ταράτσας", "ελαστομερές", "υγρή μεμβράνη"];

      if (condition.key === "new") {
        primerRequired = true;
        primerLabel = "Αστάρι στεγανοποίησης συμβατό με το υπόστρωμα";
        preparation.push("Έλεγχος κλίσεων και απορροών", "Καθαρισμός", "Επισκευή ατελειών", "Αστάρωμα");
        reasons.push("Η νέα στεγανοποίηση χρειάζεται συμβατό πλήρες σύστημα και σωστά προετοιμασμένη βάση.");
      } else if (condition.key === "cracks") {
        primerRequired = true;
        primerLabel = "Αστάρι συστήματος στεγανοποίησης";
        preparation.push("Καθαρισμός", "Επισκευή ρωγμών και αρμών", "Ενίσχυση κρίσιμων σημείων όπου απαιτείται", "Αστάρωμα");
        reasons.push("Οι ρωγμές και οι αρμοί είναι κρίσιμα σημεία και πρέπει να αποκατασταθούν πριν τη μεμβράνη.");
        warnings.push("Μεγάλες ρωγμές, λιμνάζοντα νερά ή αστοχίες κλίσεων χρειάζονται τεχνική αξιολόγηση πριν την εφαρμογή.");
      } else {
        primerRequired = true;
        primerLabel = "Αστάρι ανανέωσης συμβατό με το υπάρχον σύστημα";
        preparation.push("Έλεγχος παλιάς στεγάνωσης", "Πλύσιμο και πλήρες στέγνωμα", "Τοπικές επισκευές", "Αστάρωμα όπου απαιτείται");
        reasons.push("Η συμβατότητα με το υπάρχον σύστημα είναι απαραίτητη πριν την ανανέωση.");
      }
      break;
    }
  }

  return {
    systemName,
    topcoatLabel,
    finishLabel,
    primerRequired,
    primerLabel,
    preparation,
    reasons,
    warnings,
    tags
  } as const;
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

  const query = system.tags.slice(0, 4).join(" ");
  const quantityNote =
    "Η ακριβής ποσότητα, ο αριθμός στρώσεων, η κατανάλωση και οι συσκευασίες θα υπολογιστούν αφού επιλεγεί συγκεκριμένο προϊόν, από τα επίσημα τεχνικά στοιχεία του κατασκευαστή.";

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
    searchHref: `/shop?q=${encodeURIComponent(query)}`
  };
}

export function paintSurface(key: PaintSurfaceKey): PaintSurface {
  return surfaceByKey(key);
}

export function paintMood(key: PaintMoodKey): PaintMood {
  return PAINT_MOODS.find((mood) => mood.key === key) ?? PAINT_MOODS[0];
}
