export type BuildModuleKey = "paint" | "waterproofing" | "insulation" | "repair";
export type BuildChoice = Readonly<{ key: string; label: string; hint: string; icon?: string }>;
export type BuildModuleDefinition = Readonly<{ key: BuildModuleKey; eyebrow: string; title: string; subtitle: string; description: string; icon: string; available: boolean }>;

/** Legacy presentation envelope only. Technical guidance must come from the reviewed Layer A/B/C runtime. */
export type BuildProjectRecommendation = Readonly<{
  title: string; summary: string; layers: readonly string[]; preparation: readonly string[]; warnings: readonly string[];
  catalogueTags: readonly string[]; searchHref: string; areaM2: number; quantityNote: string;
}>;

export const BUILD_MODULES: readonly BuildModuleDefinition[] = [
  { key: "paint", eyebrow: "PAINT CONSULTANT", title: "Η ΤΕΛΕΙΑ ΠΙΝΕΛΙΑ", subtitle: "Χρώμα & βαφή", description: "Βρες σωστό σύστημα βαφής, απόχρωση, προεργασία και ποσότητα.", icon: "◒", available: true },
  { key: "waterproofing", eyebrow: "WATERPROOFING CONSULTANT", title: "ΜΕΙΝΕ ΣΤΕΓΝΟΣ", subtitle: "Στεγανοποίηση", description: "Ταράτσα, μπαλκόνι, εξωτερικός τοίχος ή υπόγειο — ξεκίνα από το πρόβλημα.", icon: "≋", available: true },
  { key: "insulation", eyebrow: "THERMAL CONSULTANT", title: "ΚΡΑΤΑ ΤΗ ΘΕΡΜΟΚΡΑΣΙΑ", subtitle: "Θερμομόνωση", description: "Βρες την ελεγμένη διαδρομή καθοδήγησης για όψη, ταράτσα ή εσωτερική επιφάνεια.", icon: "◐", available: true },
  { key: "repair", eyebrow: "REPAIR CONSULTANT", title: "ΦΤΙΑΞ' ΤΟ ΣΩΣΤΑ", subtitle: "Επισκευή τοίχου", description: "Ρωγμές, τρύπες, ξεφλούδισμα, σοβάς ή υγρασία πριν από το τελικό φινίρισμα.", icon: "✦", available: true }
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
  { key: "cracks", label: "Ρωγμές / αρμοί", hint: "Υπάρχουν ασυνέχειες της επιφάνειας που πρέπει να αξιολογηθούν." },
  { key: "standing-water", label: "Λιμνάζοντα νερά", hint: "Το νερό μένει στην επιφάνεια μετά τη βροχή." }
] as const;
export const INSULATION_LOCATIONS: readonly BuildChoice[] = [
  { key: "facade", label: "Εξωτερική όψη", hint: "Εξωτερική θερμική προστασία της όψης.", icon: "▥" },
  { key: "roof", label: "Ταράτσα / οροφή", hint: "Θερμική προστασία της επάνω ζώνης του κτιρίου.", icon: "▱" },
  { key: "interior-wall", label: "Εσωτερικός τοίχος", hint: "Εσωτερική επιφάνεια που χρειάζεται αξιολόγηση πριν επιλεγεί λύση.", icon: "□" }
] as const;
export const INSULATION_GOALS: readonly BuildChoice[] = [
  { key: "winter", label: "Κρύο τον χειμώνα", hint: "Θέλω βελτίωση της χειμερινής θερμικής συμπεριφοράς." },
  { key: "summer", label: "Ζέστη το καλοκαίρι", hint: "Θέλω βελτίωση της θερινής θερμικής συμπεριφοράς." },
  { key: "both", label: "Και τα δύο", hint: "Θέλω συνολική βελτίωση θερμικής συμπεριφοράς." },
  { key: "cold-surface", label: "Ψυχρή επιφάνεια", hint: "Υπάρχει κρύο σημείο χωρίς εμφανή υγροποίηση ή μούχλα." },
  { key: "condensation", label: "Συμπύκνωση / μούχλα", hint: "Υπάρχει υγροποίηση ή μούχλα σε ψυχρή επιφάνεια." }
] as const;
export const REPAIR_ISSUES: readonly BuildChoice[] = [
  { key: "hairline", label: "Τριχοειδείς ρωγμές", hint: "Λεπτές ρωγμές χωρίς εμφανή μετακίνηση.", icon: "⌁" },
  { key: "recurrent-crack", label: "Μεγάλη / επανεμφανιζόμενη ρωγμή", hint: "Ρωγμή που μεγαλώνει, επανέρχεται ή δείχνει πιθανή κίνηση.", icon: "⌁" },
  { key: "holes", label: "Τρύπες / χτυπήματα", hint: "Τοπικές φθορές που χρειάζονται αξιολόγηση και επισκευή.", icon: "○" },
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

function presentation(title: string, summary: string, areaM2: number): BuildProjectRecommendation {
  const safeArea = Math.max(1, Math.min(1000, areaM2));
  return { title, summary, layers: [], preparation: [], warnings: [], catalogueTags: [], searchHref: "/shop", areaM2: safeArea,
    quantityNote: "Η τεχνική καθοδήγηση, η επιλεξιμότητα προϊόντων και η ποσότητα προκύπτουν μόνο από την ελεγμένη διαδρομή Layer A + Layer B + Layer C." };
}
export function recommendWaterproofing(input: { location: string; problem: string; areaM2: number }): BuildProjectRecommendation {
  return presentation("Έλεγχος στεγανοποίησης", `${input.location} · ${input.problem}`, input.areaM2);
}
export function recommendInsulation(input: { location: string; goal: string; areaM2: number }): BuildProjectRecommendation {
  return presentation("Έλεγχος θερμομόνωσης", `${input.location} · ${input.goal}`, input.areaM2);
}
export function recommendRepair(input: { issue: string; severity: string; areaM2: number }): BuildProjectRecommendation {
  return presentation("Έλεγχος επισκευής", `${input.issue} · ${input.severity}`, input.areaM2);
}
