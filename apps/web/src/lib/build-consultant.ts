export type BuildModuleKey = "paint" | "waterproofing" | "insulation" | "repair";

export type BuildChoice = Readonly<{
  key: string;
  label: string;
  hint: string;
  icon?: string;
}>;

export type BuildModuleDefinition = Readonly<{
  key: BuildModuleKey;
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  available: boolean;
}>;

export type BuildProjectRecommendation = Readonly<{
  title: string;
  summary: string;
  layers: readonly string[];
  preparation: readonly string[];
  warnings: readonly string[];
  catalogueTags: readonly string[];
  searchHref: string;
  areaM2: number;
  quantityNote: string;
}>;

export const BUILD_MODULES: readonly BuildModuleDefinition[] = [
  {
    key: "paint",
    eyebrow: "PAINT CONSULTANT",
    title: "Η ΤΕΛΕΙΑ ΠΙΝΕΛΙΑ",
    subtitle: "Χρώμα & βαφή",
    description: "Βρες σωστό σύστημα βαφής, απόχρωση, προεργασία και ποσότητα.",
    icon: "◒",
    available: true
  },
  {
    key: "waterproofing",
    eyebrow: "WATERPROOFING CONSULTANT",
    title: "ΜΕΙΝΕ ΣΤΕΓΝΟΣ",
    subtitle: "Στεγανοποίηση",
    description: "Ταράτσα, μπαλκόνι, εξωτερικός τοίχος ή υπόγειο — ξεκίνα από το πρόβλημα.",
    icon: "≋",
    available: true
  },
  {
    key: "insulation",
    eyebrow: "THERMAL CONSULTANT",
    title: "ΚΡΑΤΑ ΤΗ ΘΕΡΜΟΚΡΑΣΙΑ",
    subtitle: "Θερμομόνωση",
    description: "Βρες τον κατάλληλο τύπο συστήματος για όψη, ταράτσα ή εσωτερική επιφάνεια.",
    icon: "◐",
    available: true
  },
  {
    key: "repair",
    eyebrow: "REPAIR CONSULTANT",
    title: "ΦΤΙΑΞ' ΤΟ ΣΩΣΤΑ",
    subtitle: "Επισκευή τοίχου",
    description: "Ρωγμές, τρύπες, ξεφλούδισμα, σοβάς ή υγρασία πριν από το τελικό φινίρισμα.",
    icon: "✦",
    available: true
  }
] as const;

export const WATERPROOF_LOCATIONS: readonly BuildChoice[] = [
  { key: "roof", label: "Ταράτσα / δώμα", hint: "Οριζόντια επιφάνεια εκτεθειμένη σε βροχή και ήλιο.", icon: "▱" },
  { key: "balcony", label: "Μπαλκόνι", hint: "Πλάκα ή δάπεδο όπου εμφανίζεται εισροή νερού.", icon: "□" },
  { key: "exterior-wall", label: "Εξωτερικός τοίχος", hint: "Όψη ή τοίχος που βρέχεται από βροχή.", icon: "☂" },
  { key: "basement", label: "Υπόγειο", hint: "Τοίχος ή δάπεδο σε επαφή με έδαφος / υγρασία.", icon: "▤" }
] as const;

export const WATERPROOF_PROBLEMS: readonly BuildChoice[] = [
  { key: "maintenance", label: "Συντήρηση", hint: "Υπάρχει παλιό σύστημα και θέλω ανανέωση." },
  { key: "leak", label: "Μπαίνει νερό", hint: "Υπάρχουν εμφανή σημάδια εισροής ή διαρροής." },
  { key: "cracks", label: "Ρωγμές / αρμοί", hint: "Το νερό πιθανόν περνά από ασυνέχειες της επιφάνειας." },
  { key: "standing-water", label: "Λιμνάζοντα νερά", hint: "Το νερό μένει στην επιφάνεια μετά τη βροχή." }
] as const;

export const INSULATION_LOCATIONS: readonly BuildChoice[] = [
  { key: "facade", label: "Εξωτερική όψη", hint: "Σύστημα θερμοπρόσοψης / ETICS.", icon: "▥" },
  { key: "roof", label: "Ταράτσα / οροφή", hint: "Θερμική προστασία από πάνω.", icon: "▱" },
  { key: "interior-wall", label: "Εσωτερικός τοίχος", hint: "Όταν εξωτερική επέμβαση δεν είναι εφικτή.", icon: "□" }
] as const;

export const INSULATION_GOALS: readonly BuildChoice[] = [
  { key: "winter", label: "Κρύο τον χειμώνα", hint: "Μεγάλες απώλειες θερμότητας." },
  { key: "summer", label: "Ζέστη το καλοκαίρι", hint: "Υπερθέρμανση επιφανειών και χώρου." },
  { key: "both", label: "Και τα δύο", hint: "Θέλω συνολική βελτίωση θερμικής συμπεριφοράς." },
  { key: "condensation", label: "Συμπύκνωση / ψυχρός τοίχος", hint: "Εμφανίζονται κρύες επιφάνειες ή υγροποίηση." }
] as const;

export const REPAIR_ISSUES: readonly BuildChoice[] = [
  { key: "hairline", label: "Τριχοειδείς ρωγμές", hint: "Λεπτές ρωγμές χωρίς εμφανή μετακίνηση.", icon: "⌁" },
  { key: "recurrent-crack", label: "Μεγάλη / επανεμφανιζόμενη ρωγμή", hint: "Ρωγμή που μεγαλώνει, επανέρχεται ή δείχνει πιθανή κίνηση.", icon: "⌁" },
  { key: "holes", label: "Τρύπες / χτυπήματα", hint: "Τοπικές φθορές που χρειάζονται γέμισμα.", icon: "○" },
  { key: "peeling", label: "Ξεφλούδισμα", hint: "Παλιά βαφή ή σαθρή στρώση αποκολλάται.", icon: "◫" },
  { key: "plaster", label: "Χαλασμένος σοβάς", hint: "Βαθύτερη φθορά ή αποσάθρωση.", icon: "▧" },
  { key: "friable", label: "Σαθρή / αδύναμη επιφάνεια", hint: "Η βάση τρίβεται, σκονίζει ή αποκολλάται και πρέπει να ελεγχθεί πριν επισκευαστεί.", icon: "▧" },
  { key: "damp", label: "Υγρασία / μούχλα", hint: "Πρώτα χρειάζεται εντοπισμός της αιτίας.", icon: "◌" }
] as const;

export const REPAIR_SEVERITIES: readonly BuildChoice[] = [
  { key: "local", label: "Μικρό / τοπικό", hint: "Ένα ή λίγα σημεία." },
  { key: "medium", label: "Μεσαίο", hint: "Αρκετά σημεία σε έναν τοίχο." },
  { key: "extensive", label: "Εκτεταμένο", hint: "Μεγάλο τμήμα ή πολλοί τοίχοι." }
] as const;

function searchHref(tags: readonly string[]): string {
  return `/shop?q=${encodeURIComponent(tags.slice(0, 5).join(" "))}`;
}

export function recommendWaterproofing(input: {
  location: string;
  problem: string;
  areaM2: number;
}): BuildProjectRecommendation {
  const areaM2 = Math.max(1, Math.min(1000, input.areaM2));
  const warnings: string[] = [];
  const preparation = ["Καθαρισμός και απομάκρυνση σαθρών υλικών", "Πλήρες στέγνωμα της βάσης"];
  const layers: string[] = [];
  const tags: string[] = ["στεγανοποίηση"];

  if (input.location === "roof" || input.location === "balcony") {
    layers.push("Κατάλληλο αστάρι συστήματος", "Ελαστική στεγανωτική μεμβράνη σε απαιτούμενες στρώσεις");
    tags.push("ταράτσα", "ελαστομερές", "υγρή μεμβράνη");
  } else if (input.location === "exterior-wall") {
    layers.push("Σταθεροποιητικό / συμβατό αστάρι", "Υδροαπωθητικό ή στεγανωτικό σύστημα κατακόρυφης επιφάνειας");
    tags.push("εξωτερικός τοίχος", "υδροαπωθητικό");
  } else {
    layers.push("Σύστημα στεγανοποίησης κατάλληλο για αρνητικές / θετικές πιέσεις ανά περίπτωση");
    tags.push("υπόγειο", "τσιμεντοειδές στεγανωτικό");
    warnings.push("Σε υπόγεια πρέπει να εξακριβωθεί από πού έρχεται η υγρασία πριν επιλεγεί σύστημα.");
  }

  if (input.problem === "cracks") {
    preparation.push("Επισκευή ρωγμών και αρμών με συμβατό ελαστικό υλικό");
    tags.push("ρωγμές", "αρμοί");
  } else if (input.problem === "standing-water") {
    preparation.push("Έλεγχος κλίσεων και απορροών");
    warnings.push("Λιμνάζοντα νερά μπορεί να απαιτούν διόρθωση κλίσεων και όχι μόνο νέα επάλειψη.");
  } else if (input.problem === "leak") {
    warnings.push("Ενεργή διαρροή χρειάζεται εντοπισμό του σημείου εισροής πριν από οποιαδήποτε επάλειψη.");
  }

  return {
    title: "Σύστημα στεγανοποίησης",
    summary: "Η λύση ξεκινά από το σημείο εισροής και τη σωστή προετοιμασία — όχι από ένα μεμονωμένο προϊόν.",
    layers,
    preparation,
    warnings,
    catalogueTags: tags,
    searchHref: searchHref(tags),
    areaM2,
    quantityNote: "Η τελική κατανάλωση θα προκύψει από το πραγματικό προϊόν, το υπόστρωμα και τις απαιτούμενες στρώσεις."
  };
}

export function recommendInsulation(input: {
  location: string;
  goal: string;
  areaM2: number;
}): BuildProjectRecommendation {
  const areaM2 = Math.max(1, Math.min(1000, input.areaM2));
  const warnings: string[] = [];
  const preparation = ["Έλεγχος υποστρώματος και υγρασίας", "Επιβεβαίωση διαστάσεων και κρίσιμων λεπτομερειών"];
  const tags = ["θερμομόνωση"];
  const layers: string[] = [];

  if (input.location === "facade") {
    layers.push(
      "Θερμομονωτικές πλάκες κατάλληλου πάχους",
      "Κόλλα / βασικό επίχρισμα",
      "Μηχανική στερέωση όπου απαιτείται",
      "Υαλόπλεγμα ενίσχυσης",
      "Αστάρι και τελικό επίχρισμα"
    );
    tags.push("θερμοπρόσοψη", "ETICS", "θερμομονωτική πλάκα", "υαλόπλεγμα");
  } else if (input.location === "roof") {
    layers.push("Θερμομονωτική στρώση ταράτσας", "Συμβατή προστασία / στεγανοποίηση ανά σύστημα");
    tags.push("μόνωση ταράτσας", "θερμομονωτική πλάκα");
    warnings.push("Θερμομόνωση και στεγανοποίηση στην ταράτσα πρέπει να σχεδιάζονται ως ενιαίο σύστημα.");
  } else {
    layers.push("Εσωτερικό θερμομονωτικό σύστημα με ελεγχόμενη διαχείριση υδρατμών");
    tags.push("εσωτερική θερμομόνωση");
    warnings.push("Η εσωτερική θερμομόνωση μπορεί να αλλάξει το σημείο δρόσου και χρειάζεται έλεγχο συμπύκνωσης.");
  }

  if (input.goal === "condensation") {
    warnings.push("Η συμπύκνωση δεν λύνεται μόνο με περισσότερη μόνωση· πρέπει να αξιολογηθούν θερμογέφυρες, αερισμός και υγρασία.");
  }

  return {
    title: "Σύστημα θερμομόνωσης",
    summary: "Το Studio προτείνει τη δομή του συστήματος. Το πάχος και οι τελικές τεχνικές προδιαγραφές εξαρτώνται από το κτίριο.",
    layers,
    preparation,
    warnings,
    catalogueTags: tags,
    searchHref: searchHref(tags),
    areaM2,
    quantityNote: "Για πλήρη ποσοτική λίστα θα χρειαστούμε διαστάσεις, πάχος μόνωσης και τεχνικά δεδομένα του επιλεγμένου συστήματος."
  };
}

export function recommendRepair(input: {
  issue: string;
  severity: string;
  areaM2: number;
}): BuildProjectRecommendation {
  const areaM2 = Math.max(1, Math.min(1000, input.areaM2));
  const preparation: string[] = [];
  const layers: string[] = [];
  const warnings: string[] = [];
  const tags = ["επισκευή τοίχου"];

  if (input.issue === "hairline") {
    preparation.push("Καθαρισμός και έλεγχος ότι η ρωγμή δεν είναι ενεργή");
    layers.push("Κατάλληλος στόκος / υλικό ρωγμών", "Τρίψιμο", "Αστάρι", "Τελική βαφή");
    tags.push("στόκος", "ρωγμές");
  } else if (input.issue === "recurrent-crack") {
    preparation.push("Έλεγχος αν η ρωγμή μεγαλώνει, επανέρχεται ή συνοδεύεται από μετατόπιση");
    warnings.push("Μεγάλη ή επανεμφανιζόμενη ρωγμή χρειάζεται πρώτα αξιολόγηση της αιτίας και της σταθερότητας πριν επιλεγεί επισκευή.");
    tags.push("ρωγμές", "επισκευή ρωγμής");
  } else if (input.issue === "holes") {
    preparation.push("Καθαρισμός σκόνης και χαλαρών ακμών");
    layers.push("Επισκευαστικός στόκος κατάλληλου βάθους", "Λείανση", "Αστάρι", "Τελική βαφή");
    tags.push("επισκευαστικός στόκος");
  } else if (input.issue === "peeling") {
    preparation.push("Πλήρης αφαίρεση σαθρής / αποκολλημένης βαφής");
    layers.push("Σταθεροποιητικό αστάρι όπου απαιτείται", "Στοκάρισμα", "Τελικό σύστημα βαφής");
    tags.push("αστάρι σταθεροποίησης", "στόκος");
  } else if (input.issue === "plaster") {
    preparation.push("Απομάκρυνση σαθρού σοβά μέχρι σταθερό υπόστρωμα");
    layers.push("Επισκευαστικό κονίαμα / σοβάς", "Εξομάλυνση", "Αστάρι", "Τελικό φινίρισμα");
    tags.push("επισκευαστικό κονίαμα", "σοβάς");
  } else if (input.issue === "friable") {
    preparation.push("Αφαίρεση ασταθούς υλικού μέχρι σταθερή βάση", "Έλεγχος της υπολειπόμενης συνοχής πριν επιλεγεί τοπική επισκευή");
    layers.push("Επισκευή μόνο πάνω σε σταθερή βάση", "Τελικό φινίρισμα μετά από επαρκή ωρίμανση / στέγνωμα");
    tags.push("επισκευή τοίχου", "σταθεροποίηση επιφάνειας");
  } else {
    preparation.push("Εντοπισμός και αποκατάσταση της αιτίας υγρασίας", "Καθαρισμός / εξυγίανση", "Πλήρες στέγνωμα");
    layers.push("Επισκευή βάσης", "Συμβατό αστάρι", "Τελικό σύστημα μετά την αποκατάσταση");
    tags.push("υγρασία", "αντιμουχλικό");
    warnings.push("Μην καλύψεις ενεργή υγρασία ή μούχλα με νέο χρώμα χωρίς να λυθεί πρώτα η αιτία.");
  }

  if (input.severity === "extensive") {
    warnings.push("Σε εκτεταμένη φθορά είναι προτιμότερος έλεγχος από τεχνικό πριν αγοραστούν υλικά.");
  }

  return {
    title: "Σύστημα επισκευής επιφάνειας",
    summary: "Πρώτα σταθεροποιούμε τη βάση και μετά περνάμε στο τελικό φινίρισμα.",
    layers,
    preparation,
    warnings,
    catalogueTags: tags,
    searchHref: searchHref(tags),
    areaM2,
    quantityNote: "Η ποσότητα επισκευαστικού υλικού εξαρτάται περισσότερο από το βάθος της φθοράς παρά μόνο από τα m²."
  };
}
