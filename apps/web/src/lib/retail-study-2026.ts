export const RETAIL_STUDY_2026_SLUG = "greek-retail-2026";
export const RETAIL_STUDY_2026_VERSION = 1;
export const RETAIL_STUDY_2026_ANALYSIS_VERSION = "1.0.0";

export type SurveyOption = Readonly<{ value: string; label: string }>;
export type SurveyQuestion = Readonly<{
  id: string;
  section: string;
  type: "single" | "multi" | "matrix" | "text";
  title: string;
  help?: string;
  required?: boolean;
  maxSelections?: number;
  options?: readonly SurveyOption[];
  rows?: readonly SurveyOption[];
  scale?: readonly SurveyOption[];
  showWhen?: Readonly<{ questionId: string; includes: string }>;
}>;

const sectorOptions: readonly SurveyOption[] = [
  { value: "fashion-footwear", label: "Μόδα / Υποδήματα / Αξεσουάρ" },
  { value: "beauty-personal-care", label: "Καλλυντικά / Ομορφιά / Προσωπική φροντίδα" },
  { value: "home-living", label: "Σπίτι / Έπιπλα / Διακόσμηση" },
  { value: "diy-building", label: "Χρώματα / Εργαλεία / Οικοδομικά" },
  { value: "electronics", label: "Ηλεκτρονικά / Ηλεκτρικά" },
  { value: "sports-books-toys", label: "Αθλητικά / Βιβλία / Παιχνίδια / Hobby" },
  { value: "jewellery-watches", label: "Κοσμήματα / Ρολόγια" },
  { value: "flowers-pets", label: "Άνθη / Φυτά / Pet" },
  { value: "second-hand", label: "Μεταχειρισμένα / Second-hand" },
  { value: "auto-parts", label: "Οχήματα / Ανταλλακτικά" },
  { value: "other-retail", label: "Άλλο λιανικό εμπόριο" }
];

const salesChannelOptions: readonly SurveyOption[] = [
  { value: "physical_store", label: "Φυσικό κατάστημα" },
  { value: "own_ecommerce", label: "Δικό μας e-shop" },
  { value: "marketplace", label: "Marketplace / πλατφόρμα τρίτου" },
  { value: "social", label: "Social media" },
  { value: "messaging_phone", label: "Τηλέφωνο / messaging" },
  { value: "other", label: "Άλλο" }
];

const digitalCapabilityOptions: readonly SurveyOption[] = [
  { value: "website", label: "Ενημερωτικό website" },
  { value: "ecommerce", label: "E-shop με online παραγγελία" },
  { value: "digital_catalogue", label: "Ψηφιακός κατάλογος προϊόντων" },
  { value: "live_inventory", label: "Ψηφιακή / live εικόνα αποθέματος" },
  { value: "digital_payments", label: "Online / ψηφιακές πληρωμές" },
  { value: "marketplace", label: "Πώληση μέσω marketplace" },
  { value: "click_collect", label: "Click & collect" },
  { value: "delivery_integration", label: "Οργανωμένη αποστολή / delivery integration" },
  { value: "crm", label: "CRM / οργανωμένη βάση πελατών" },
  { value: "analytics", label: "Analytics για πωλήσεις ή marketing" },
  { value: "stock_erp", label: "ERP / εμπορική διαχείριση συνδεδεμένη με απόθεμα" },
  { value: "automation_ai", label: "Αυτοματισμοί ή εργαλεία AI" }
];

const frictionRows: readonly SurveyOption[] = [
  { value: "catalogue", label: "Καταχώριση και συντήρηση καταλόγου" },
  { value: "photos_content", label: "Φωτογραφίες / περιεχόμενο προϊόντων" },
  { value: "inventory", label: "Συγχρονισμός αποθέματος και τιμών" },
  { value: "marketing", label: "Απόκτηση πελατών / digital marketing" },
  { value: "fees", label: "Προμήθειες και λοιπά κόστη online πώλησης" },
  { value: "shipping", label: "Αποστολές / τοπική παράδοση" },
  { value: "returns", label: "Επιστροφές και εξυπηρέτηση μετά την πώληση" },
  { value: "time_skills", label: "Χρόνος / τεχνικές γνώσεις προσωπικού" }
];

const frictionScale: readonly SurveyOption[] = [
  { value: "1", label: "Καθόλου πρόβλημα" },
  { value: "2", label: "Μικρό" },
  { value: "3", label: "Μέτριο" },
  { value: "4", label: "Μεγάλο" },
  { value: "5", label: "Πολύ μεγάλο" },
  { value: "na", label: "Δεν εφαρμόζεται" }
];

export const RETAIL_STUDY_2026_QUESTIONS: readonly SurveyQuestion[] = [
  {
    id: "sector_primary",
    section: "Η επιχείρησή σας",
    type: "single",
    title: "Ποια κατηγορία περιγράφει καλύτερα την κύρια λιανική δραστηριότητά σας σήμερα;",
    help: "Χρησιμοποιούμε την απάντηση για να ελέγξουμε την ορθότητα της κατηγοριοποίησης του δείγματος.",
    required: true,
    options: sectorOptions
  },
  {
    id: "employees",
    section: "Η επιχείρησή σας",
    type: "single",
    title: "Πόσα άτομα απασχολεί συνολικά η επιχείρηση;",
    required: true,
    options: [
      { value: "1", label: "1 άτομο" },
      { value: "2-4", label: "2–4" },
      { value: "5-9", label: "5–9" },
      { value: "10-19", label: "10–19" },
      { value: "20-49", label: "20–49" },
      { value: "50+", label: "50+" },
      { value: "prefer_not", label: "Δεν επιθυμώ να απαντήσω" }
    ]
  },
  {
    id: "locations",
    section: "Η επιχείρησή σας",
    type: "single",
    title: "Πόσα φυσικά σημεία λιανικής λειτουργείτε;",
    required: true,
    options: [
      { value: "0", label: "Κανένα" },
      { value: "1", label: "1" },
      { value: "2-3", label: "2–3" },
      { value: "4-9", label: "4–9" },
      { value: "10+", label: "10+" }
    ]
  },
  {
    id: "sales_channels",
    section: "Πώς πουλάτε σήμερα",
    type: "multi",
    title: "Από ποια κανάλια πραγματοποιείτε σήμερα πωλήσεις;",
    required: true,
    options: salesChannelOptions
  },
  {
    id: "online_sales_share",
    section: "Πώς πουλάτε σήμερα",
    type: "single",
    title: "Περίπου τι ποσοστό του συνολικού τζίρου σας προέρχεται από online πωλήσεις;",
    required: true,
    options: [
      { value: "0", label: "0%" },
      { value: "1-10", label: "1–10%" },
      { value: "11-25", label: "11–25%" },
      { value: "26-50", label: "26–50%" },
      { value: "51-75", label: "51–75%" },
      { value: "76-100", label: "76–100%" },
      { value: "unknown", label: "Δεν γνωρίζω / δεν το μετράμε" }
    ]
  },
  {
    id: "local_customer_share",
    section: "Τοπικό εμπόριο",
    type: "single",
    title: "Περίπου τι ποσοστό των πελατών σας βρίσκεται σε ακτίνα έως 25 χλμ. από την επιχείρηση;",
    required: true,
    options: [
      { value: "0-25", label: "0–25%" },
      { value: "26-50", label: "26–50%" },
      { value: "51-75", label: "51–75%" },
      { value: "76-100", label: "76–100%" },
      { value: "unknown", label: "Δεν γνωρίζω" }
    ]
  },
  {
    id: "local_inventory_discoverability",
    section: "Τοπικό εμπόριο",
    type: "single",
    title: "Αν κάποιος ψάξει online ένα συγκεκριμένο προϊόν που έχετε σήμερα στο κατάστημα, πόσο εύκολα μπορεί να δει ότι είναι διαθέσιμο;",
    required: true,
    options: [
      { value: "0", label: "Πρακτικά αδύνατο" },
      { value: "1", label: "Δύσκολα" },
      { value: "2", label: "Μερικές φορές" },
      { value: "3", label: "Σχετικά εύκολα" },
      { value: "4", label: "Εύκολα και με αξιόπιστη διαθεσιμότητα" }
    ]
  },
  {
    id: "digital_capabilities",
    section: "Ψηφιακή ετοιμότητα",
    type: "multi",
    title: "Ποια από τα παρακάτω χρησιμοποιείτε ήδη στην καθημερινή λειτουργία;",
    help: "Επιλέξτε όσα ισχύουν. Η ερώτηση χρησιμοποιείται για έναν σταθερό δείκτη ψηφιακής ετοιμότητας.",
    required: true,
    options: digitalCapabilityOptions
  },
  {
    id: "commerce_friction",
    section: "Εμπόδια",
    type: "matrix",
    title: "Πόσο μεγάλο πρόβλημα αποτελεί σήμερα καθένα από τα παρακάτω για τις online πωλήσεις σας;",
    required: true,
    rows: frictionRows,
    scale: frictionScale
  },
  {
    id: "top_barriers",
    section: "Εμπόδια",
    type: "multi",
    title: "Ποια είναι τα έως 3 σημαντικότερα εμπόδια για την ανάπτυξη της επιχείρησής σας μέσω digital commerce;",
    maxSelections: 3,
    required: true,
    options: [
      { value: "cost_ecommerce", label: "Κόστος δημιουργίας / συντήρησης e-shop" },
      { value: "marketplace_fees", label: "Προμήθειες marketplaces" },
      { value: "marketing_cost", label: "Κόστος digital marketing" },
      { value: "time", label: "Έλλειψη χρόνου" },
      { value: "skills", label: "Έλλειψη τεχνικών γνώσεων" },
      { value: "catalogue", label: "Διαχείριση καταλόγου / περιεχομένου" },
      { value: "inventory", label: "Απόθεμα / συγχρονισμός συστημάτων" },
      { value: "shipping_returns", label: "Αποστολές / επιστροφές" },
      { value: "price_competition", label: "Έντονος ανταγωνισμός τιμής" },
      { value: "demand", label: "Δεν βλέπουμε αρκετή online ζήτηση" },
      { value: "other", label: "Άλλο" }
    ]
  },
  {
    id: "sustainable_commission",
    section: "Οικονομικά online πώλησης",
    type: "single",
    title: "Ποιο συνολικό ποσοστό προμήθειας marketplace θεωρείτε βιώσιμο για μια online πώληση, πριν από μεταφορικά και ΦΠΑ;",
    required: true,
    options: [
      { value: "0", label: "0%" },
      { value: "1-5", label: "1–5%" },
      { value: "6-10", label: "6–10%" },
      { value: "11-15", label: "11–15%" },
      { value: "16-20", label: "16–20%" },
      { value: "21+", label: "Πάνω από 20%" },
      { value: "unknown", label: "Δεν γνωρίζω" }
    ]
  },
  {
    id: "marketplace_online_share",
    section: "Πλατφόρμες",
    type: "single",
    title: "Από τις online πωλήσεις σας, περίπου τι ποσοστό γίνεται μέσω marketplaces τρίτων;",
    required: true,
    showWhen: { questionId: "sales_channels", includes: "marketplace" },
    options: [
      { value: "0-25", label: "0–25%" },
      { value: "26-50", label: "26–50%" },
      { value: "51-75", label: "51–75%" },
      { value: "76-100", label: "76–100%" },
      { value: "unknown", label: "Δεν γνωρίζω" }
    ]
  },
  {
    id: "marketplace_benefits",
    section: "Πλατφόρμες",
    type: "multi",
    title: "Ποια είναι τα σημαντικότερα οφέλη που σας προσφέρουν τα marketplaces;",
    maxSelections: 3,
    showWhen: { questionId: "sales_channels", includes: "marketplace" },
    options: [
      { value: "reach", label: "Πρόσβαση σε περισσότερους πελάτες" },
      { value: "trust", label: "Εμπιστοσύνη καταναλωτή" },
      { value: "payments", label: "Πληρωμές" },
      { value: "logistics", label: "Logistics / αποστολές" },
      { value: "marketing", label: "Marketing / απόκτηση πελατών" },
      { value: "ease", label: "Ευκολία λειτουργίας" },
      { value: "other", label: "Άλλο" }
    ]
  },
  {
    id: "marketplace_costs",
    section: "Πλατφόρμες",
    type: "multi",
    title: "Ποια είναι τα σημαντικότερα μειονεκτήματα που αντιμετωπίζετε στα marketplaces;",
    maxSelections: 3,
    showWhen: { questionId: "sales_channels", includes: "marketplace" },
    options: [
      { value: "commission", label: "Προμήθειες / χρεώσεις" },
      { value: "price_pressure", label: "Πίεση τιμών" },
      { value: "customer_relationship", label: "Περιορισμένη σχέση με τον πελάτη" },
      { value: "algorithm", label: "Εξάρτηση από κατάταξη / αλγόριθμο" },
      { value: "returns", label: "Κόστος / πολυπλοκότητα επιστροφών" },
      { value: "differentiation", label: "Δυσκολία διαφοροποίησης της επιχείρησης" },
      { value: "operations", label: "Λειτουργική πολυπλοκότητα" },
      { value: "other", label: "Άλλο" }
    ]
  },
  {
    id: "merchant_identity_importance",
    section: "Σχέση με τον πελάτη",
    type: "single",
    title: "Πόσο σημαντικό είναι για εσάς ο online πελάτης να γνωρίζει ποια επιχείρηση πραγματικά εξυπηρετεί την παραγγελία του;",
    required: true,
    options: [
      { value: "1", label: "Καθόλου σημαντικό" },
      { value: "2", label: "Λίγο" },
      { value: "3", label: "Μέτρια" },
      { value: "4", label: "Πολύ" },
      { value: "5", label: "Εξαιρετικά σημαντικό" }
    ]
  },
  {
    id: "helpful_tools",
    section: "Τι θα βοηθούσε",
    type: "multi",
    title: "Ποια έως 3 εργαλεία θα είχαν τη μεγαλύτερη πρακτική αξία για την επιχείρησή σας;",
    maxSelections: 3,
    required: true,
    options: [
      { value: "catalogue", label: "Εύκολος online κατάλογος προϊόντων" },
      { value: "stock_sync", label: "Αυτόματος συγχρονισμός αποθέματος / τιμών" },
      { value: "local_discovery", label: "Online ανακάλυψη από κοντινούς πελάτες" },
      { value: "click_collect", label: "Click & collect" },
      { value: "delivery", label: "Τοπική / πανελλαδική παράδοση" },
      { value: "payments", label: "Online πληρωμές" },
      { value: "invoicing", label: "Τιμολόγηση / AADE automation" },
      { value: "marketing", label: "Marketing / προβολή" },
      { value: "content_ai", label: "Βοήθεια AI για προϊόντα / περιεχόμενο" },
      { value: "analytics", label: "Analytics και επιχειρηματική εικόνα" }
    ]
  },
  {
    id: "next_12_months",
    section: "Επόμενα βήματα",
    type: "multi",
    title: "Τι σχεδιάζετε να βελτιώσετε μέσα στους επόμενους 12 μήνες;",
    maxSelections: 3,
    required: true,
    options: [
      { value: "more_online_sales", label: "Αύξηση online πωλήσεων" },
      { value: "new_ecommerce", label: "Νέο ή αναβαθμισμένο e-shop" },
      { value: "marketplaces", label: "Περισσότερη χρήση marketplaces" },
      { value: "local_delivery", label: "Click & collect / τοπική παράδοση" },
      { value: "stock_systems", label: "Καλύτερα συστήματα αποθέματος / ERP" },
      { value: "automation_ai", label: "Αυτοματισμούς / AI" },
      { value: "reduce_cost", label: "Μείωση κόστους online πώλησης" },
      { value: "no_change", label: "Δεν σχεδιάζουμε σημαντική αλλαγή" },
      { value: "unsure", label: "Δεν έχουμε αποφασίσει" }
    ]
  },
  {
    id: "one_change",
    section: "Τελευταία ερώτηση",
    type: "text",
    title: "Αν μπορούσατε να αλλάξετε μόνο ένα πράγμα στον τρόπο με τον οποίο λειτουργεί το λιανεμπόριο στην Ελλάδα σήμερα, ποιο θα ήταν;",
    help: "Προαιρετική ανοικτή απάντηση. Μην γράψετε προσωπικά στοιχεία.",
    required: false
  }
] as const;

export const RETAIL_STUDY_2026_METHODOLOGY = {
  analysisVersion: RETAIL_STUDY_2026_ANALYSIS_VERSION,
  targetPopulation: "Ενεργές επιχειρήσεις λιανικού εμπορίου μη τροφίμων στην Ελλάδα που καλύπτονται από το παγωμένο πλαίσιο ΓΕΜΗ/KAD της έρευνας.",
  defaultDesignType: "census_invitation",
  samplingFrame: "GEMI OpenData snapshot, stratified by semantic retail sector and prefecture.",
  reportingDimensions: ["sector_group", "prefecture", "employees", "digital_readiness_band"],
  weighting: {
    method: "base selection weight followed by sector×prefecture post-stratification to frozen GEMI frame totals",
    trimMin: 0.25,
    trimMax: 4,
    normalizeMeanToOne: true
  },
  publicationRules: {
    minimumRawBase: 30,
    cautionRawBaseBelow: 50,
    alwaysShowUnweightedBase: true,
    alwaysShowWeightedBase: true,
    alwaysShowMissingBase: true,
    probabilityIntervalsOnly: true
  },
  qualityRules: {
    oneResponsePerInvitation: true,
    noIpRetention: true,
    speedingWarningUnderSeconds: 45,
    automaticSpeedExclusion: false,
    excludeInstrumentMismatch: true,
    retainPartialResponsesSeparately: true
  },
  indices: {
    digitalReadiness: {
      components: digitalCapabilityOptions.map((option) => option.value),
      formula: "100 * selected_components / 12",
      interpretation: ["0-24: mostly_offline", "25-49: digitally_visible", "50-74: digitally_selling", "75-100: digitally_integrated"]
    },
    commerceFriction: {
      components: frictionRows.map((option) => option.value),
      formula: "100 * (mean(valid 1..5 responses) - 1) / 4",
      minimumAnsweredComponents: 5
    },
    localVisibilityGap: {
      formula: "local_customer_share_midpoint * (1 - local_inventory_discoverability/4)",
      status: "exploratory, not a validated psychometric scale"
    }
  }
} as const;

export const RETAIL_STUDY_2026_DEFINITION = {
  slug: RETAIL_STUDY_2026_SLUG,
  version: RETAIL_STUDY_2026_VERSION,
  title: "Ελληνικό Λιανεμπόριο 2026 — Ψηφιακή Ετοιμότητα, Εμπόδια και Τοπική Εμπορική Πραγματικότητα",
  sponsor: "ΚΟΝΤΑ ΜΟΥ",
  introduction: "Η έρευνα καταγράφει πώς λειτουργούν σήμερα οι ελληνικές επιχειρήσεις λιανικής, ποια εμπόδια αντιμετωπίζουν και ποια εργαλεία θεωρούν πραγματικά χρήσιμα. Η συμμετοχή είναι προαιρετική και οι απαντήσεις αναλύονται συγκεντρωτικά.",
  estimatedMinutes: 3,
  questions: RETAIL_STUDY_2026_QUESTIONS,
  methodology: RETAIL_STUDY_2026_METHODOLOGY
} as const;

export const KONTA_MOU_INFORMATION_PERMISSION = {
  version: "2026-10-04-v1",
  text: "Θέλω να μου στείλετε πληροφορίες για το ΚΟΝΤΑ ΜΟΥ και τις δυνατότητες που προσφέρει σε επιχειρήσεις. Η επιλογή είναι προαιρετική και ανεξάρτητη από τη συμμετοχή μου στην έρευνα."
} as const;

export type SurveyAnswers = Readonly<Record<string, unknown>>;

function isVisible(question: SurveyQuestion, answers: SurveyAnswers): boolean {
  if (!question.showWhen) return true;
  const answer = answers[question.showWhen.questionId];
  return Array.isArray(answer)
    ? answer.includes(question.showWhen.includes)
    : answer === question.showWhen.includes;
}

export function validateRetailStudyAnswers(answers: SurveyAnswers): readonly string[] {
  const errors: string[] = [];
  for (const question of RETAIL_STUDY_2026_QUESTIONS) {
    if (!isVisible(question, answers)) continue;
    const answer = answers[question.id];
    if (question.required && (answer == null || answer === "" || (Array.isArray(answer) && answer.length === 0))) {
      errors.push(question.id + ":required");
      continue;
    }
    if (answer == null || answer === "") continue;
    if (question.type === "single") {
      if (typeof answer !== "string" || !question.options?.some((option) => option.value === answer)) errors.push(question.id + ":invalid");
    } else if (question.type === "multi") {
      if (!Array.isArray(answer) || answer.some((value) => typeof value !== "string" || !question.options?.some((option) => option.value === value))) {
        errors.push(question.id + ":invalid");
      } else if (question.maxSelections && answer.length > question.maxSelections) {
        errors.push(question.id + ":too_many");
      }
    } else if (question.type === "matrix") {
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
        errors.push(question.id + ":invalid");
      } else {
        const matrix = answer as Record<string, unknown>;
        for (const row of question.rows ?? []) {
          const value = matrix[row.value];
          if (question.required && value == null) errors.push(question.id + ":" + row.value + ":required");
          else if (value != null && !question.scale?.some((option) => option.value === value)) errors.push(question.id + ":" + row.value + ":invalid");
        }
      }
    } else if (question.type === "text") {
      if (typeof answer !== "string" || answer.length > 2000) errors.push(question.id + ":invalid");
    }
  }
  return errors;
}

export type RetailStudyScores = Readonly<{
  digitalReadiness?: number;
  digitalReadinessBand?: "mostly_offline" | "digitally_visible" | "digitally_selling" | "digitally_integrated";
  commerceFriction?: number;
  localVisibilityGap?: number;
}>;

export function scoreRetailStudy(answers: SurveyAnswers): RetailStudyScores {
  const capabilities = Array.isArray(answers.digital_capabilities)
    ? answers.digital_capabilities.filter((value): value is string => typeof value === "string")
    : undefined;
  const digitalReadiness = capabilities
    ? round1(100 * digitalCapabilityOptions.filter((option) => capabilities.includes(option.value)).length / digitalCapabilityOptions.length)
    : undefined;

  const friction = answers.commerce_friction && typeof answers.commerce_friction === "object" && !Array.isArray(answers.commerce_friction)
    ? answers.commerce_friction as Record<string, unknown>
    : undefined;
  const frictionValues = friction
    ? frictionRows.map((row) => Number(friction[row.value])).filter((value) => Number.isFinite(value) && value >= 1 && value <= 5)
    : [];
  const commerceFriction = frictionValues.length >= 5
    ? round1(100 * ((frictionValues.reduce((sum, value) => sum + value, 0) / frictionValues.length) - 1) / 4)
    : undefined;

  const localMidpoints: Record<string, number> = { "0-25": 12.5, "26-50": 38, "51-75": 63, "76-100": 88 };
  const localShare = typeof answers.local_customer_share === "string" ? localMidpoints[answers.local_customer_share] : undefined;
  const discoverability = Number(answers.local_inventory_discoverability);
  const localVisibilityGap = localShare != null && Number.isFinite(discoverability) && discoverability >= 0 && discoverability <= 4
    ? round1(localShare * (1 - discoverability / 4))
    : undefined;

  return {
    digitalReadiness,
    digitalReadinessBand: digitalReadiness == null ? undefined
      : digitalReadiness < 25 ? "mostly_offline"
        : digitalReadiness < 50 ? "digitally_visible"
          : digitalReadiness < 75 ? "digitally_selling"
            : "digitally_integrated",
    commerceFriction,
    localVisibilityGap
  };
}

export type AnalysisRecord = Readonly<{
  id: string;
  stratumKey: string;
  sectorGroup: string;
  prefecture: string;
  selectionProbability: number;
  answers: SurveyAnswers;
  scores?: RetailStudyScores;
}>;

export type PopulationCell = Readonly<{ stratumKey: string; populationCount: number }>;
export type WeightedRecord = AnalysisRecord & Readonly<{ weight: number }>;

export function calibrateRetailStudyWeights(
  records: readonly AnalysisRecord[],
  population: readonly PopulationCell[],
  input: Readonly<{ trimMin?: number; trimMax?: number }> = {}
): readonly WeightedRecord[] {
  if (!records.length) return [];
  const trimMin = input.trimMin ?? RETAIL_STUDY_2026_METHODOLOGY.weighting.trimMin;
  const trimMax = input.trimMax ?? RETAIL_STUDY_2026_METHODOLOGY.weighting.trimMax;
  const populationByCell = new Map(population.map((cell) => [cell.stratumKey, Math.max(0, cell.populationCount)]));
  const baseByCell = new Map<string, number>();
  for (const record of records) {
    const base = 1 / positiveProbability(record.selectionProbability);
    baseByCell.set(record.stratumKey, (baseByCell.get(record.stratumKey) ?? 0) + base);
  }
  const raw = records.map((record) => {
    const base = 1 / positiveProbability(record.selectionProbability);
    const populationCount = populationByCell.get(record.stratumKey);
    const cellBase = baseByCell.get(record.stratumKey) ?? 0;
    const calibration = populationCount != null && populationCount > 0 && cellBase > 0 ? populationCount / cellBase : 1;
    return { ...record, weight: base * calibration };
  });
  const mean = raw.reduce((sum, record) => sum + record.weight, 0) / raw.length || 1;
  const trimmed = raw.map((record) => ({ ...record, weight: clamp(record.weight / mean, trimMin, trimMax) }));
  const trimmedMean = trimmed.reduce((sum, record) => sum + record.weight, 0) / trimmed.length || 1;
  return trimmed.map((record) => ({ ...record, weight: record.weight / trimmedMean }));
}

export function effectiveSampleSize(weights: readonly number[]): number {
  const valid = weights.filter((value) => Number.isFinite(value) && value > 0);
  const sum = valid.reduce((total, value) => total + value, 0);
  const sumSquares = valid.reduce((total, value) => total + value * value, 0);
  return sumSquares > 0 ? (sum * sum) / sumSquares : 0;
}

export type Estimate = Readonly<{
  rawBase: number;
  missingBase: number;
  weightedBase: number;
  effectiveBase: number;
  estimate: number | null;
  publishable: boolean;
  caution: boolean;
  interval95: readonly [number, number] | null;
  precisionLabel: "approximate_probability_interval" | "not_applicable_nonresponse_or_nonprobability";
}>;

export function weightedSingleChoiceEstimate(
  records: readonly WeightedRecord[],
  questionId: string,
  optionValue: string,
  designType: "census_invitation" | "stratified_probability_sample" | "nonprobability"
): Estimate {
  const answered = records.filter((record) => typeof record.answers[questionId] === "string");
  const rawBase = answered.length;
  const missingBase = records.length - rawBase;
  const weightedBase = answered.reduce((sum, record) => sum + record.weight, 0);
  const numerator = answered.filter((record) => record.answers[questionId] === optionValue).reduce((sum, record) => sum + record.weight, 0);
  const estimate = weightedBase > 0 ? numerator / weightedBase : null;
  const effectiveBase = effectiveSampleSize(answered.map((record) => record.weight));
  const publishable = rawBase >= RETAIL_STUDY_2026_METHODOLOGY.publicationRules.minimumRawBase;
  const caution = rawBase < RETAIL_STUDY_2026_METHODOLOGY.publicationRules.cautionRawBaseBelow;
  const probabilityInterval = designType === "stratified_probability_sample" && estimate != null && effectiveBase > 1
    ? wilsonInterval(estimate, effectiveBase)
    : null;
  return {
    rawBase,
    missingBase,
    weightedBase: round1(weightedBase),
    effectiveBase: round1(effectiveBase),
    estimate: estimate == null ? null : round4(estimate),
    publishable,
    caution,
    interval95: probabilityInterval ? [round4(probabilityInterval[0]), round4(probabilityInterval[1])] : null,
    precisionLabel: probabilityInterval ? "approximate_probability_interval" : "not_applicable_nonresponse_or_nonprobability"
  };
}

export type CrosstabRow = Readonly<{
  group: string;
  estimate: Estimate;
}>;

export function compareSingleChoiceBy(
  records: readonly WeightedRecord[],
  groupBy: "sectorGroup" | "prefecture",
  questionId: string,
  optionValue: string,
  designType: "census_invitation" | "stratified_probability_sample" | "nonprobability"
): readonly CrosstabRow[] {
  const groups = new Map<string, WeightedRecord[]>();
  for (const record of records) {
    const key = record[groupBy] || "unknown";
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([group, groupRecords]) => ({ group, estimate: weightedSingleChoiceEstimate(groupRecords, questionId, optionValue, designType) }))
    .sort((a, b) => b.estimate.rawBase - a.estimate.rawBase || a.group.localeCompare(b.group));
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map((key) => JSON.stringify(key) + ":" + stableJson(object[key])).join(",") + "}";
}

function wilsonInterval(proportion: number, n: number): readonly [number, number] {
  const z = 1.959963984540054;
  const denominator = 1 + z * z / n;
  const center = (proportion + z * z / (2 * n)) / denominator;
  const margin = z * Math.sqrt((proportion * (1 - proportion) / n) + (z * z / (4 * n * n))) / denominator;
  return [clamp(center - margin, 0, 1), clamp(center + margin, 0, 1)];
}

function positiveProbability(value: number): number {
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 1;
}
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function round1(value: number): number { return Math.round(value * 10) / 10; }
function round4(value: number): number { return Math.round(value * 10000) / 10000; }
