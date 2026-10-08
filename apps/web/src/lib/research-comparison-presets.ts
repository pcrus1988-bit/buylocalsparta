/**
 * Editorial entry points for existing, sourced public series.
 * These presets do not create new observations or combine incompatible units.
 */
export type ResearchComparisonPreset = Readonly<{
  id: string;
  indicator?: string;
  title: string;
  description: string;
  period: string;
}>;

export type ResearchPresetCategory = Readonly<{
  id: string;
  title: string;
  introduction: string;
  presets: readonly ResearchComparisonPreset[];
}>;

export const RESEARCH_PRESET_CATEGORIES: readonly ResearchPresetCategory[] = [
  {
    id: "households",
    title: "Νοικοκυριά & αγοραστική δύναμη",
    introduction: "Δαπάνες, κατανομή προϋπολογισμού και συσχέτιση με εισόδημα και τιμές.",
    presets: [
      { id: "household-spending", indicator: "household-spending-history", title: "Πώς μεταβλήθηκαν οι δαπάνες των νοικοκυριών;", description: "Μέση μηνιαία δαπάνη σε ονομαστικά ευρώ. Η αύξηση δεν ισούται με πραγματική κατανάλωση.", period: "2019–2025" },
      { id: "household-income", indicator: "income-refyear", title: "Πώς εξελίχθηκε το διαθέσιμο εισόδημα;", description: "Μέσο ισοδύναμο εισόδημα ανά άτομο/έτος σε τρέχοντα ευρώ, όχι δαπάνη νοικοκυριού.", period: "2018–2024" },
      { id: "urban-rural", indicator: "household-urban-rural", title: "Αστικά και αγροτικά νοικοκυριά", description: "Δείτε το επίπεδο δαπανών ανά περιοχή, χωρίς να αποδίδουμε τη διαφορά μόνο στη γεωγραφία.", period: "2024–2025" },
      { id: "budget-mix", indicator: "household-budget-mix", title: "Πού πηγαίνει ο οικογενειακός προϋπολογισμός;", description: "Μερίδια σε τρόφιμα, στέγαση, ένδυση, μεταφορές και άλλες κατηγορίες.", period: "2024–2025" },
      { id: "income-inequality", indicator: "income-inequality-2019-2025", title: "Η εισοδηματική ανισότητα αυξάνεται ή μειώνεται;", description: "Δείκτης Gini βάσει έτους έρευνας (διαφορετικό από το έτος εισοδήματος).", period: "2019–2025" },
      { id: "food-spending", indicator: "household-food-spending", title: "Πόσα ξοδεύουμε για τρόφιμα;", description: "Συγκρίνετε ονομαστικές δαπάνες σε ομάδες τροφίμων, όχι ποσοστά πληθωρισμού.", period: "2024–2025" },
      { id: "income-days", indicator: "gsevee-days-2023-2025", title: "Για πόσες ημέρες επαρκεί το εισόδημα;", description: "Αυτοαναφερόμενη οικονομική επάρκεια νοικοκυριών· προσοχή στις διαφορές δείγματος ανά έτος.", period: "2023–2025" },
      { id: "household-cuts", indicator: "gsevee-budget-2025", title: "Ποιες οικονομικές πιέσεις δηλώνουν τα νοικοκυριά;", description: "Περικοπές αναγκών και δυσκολία έκτακτων δαπανών, ως ανεξάρτητες απαντήσεις έρευνας.", period: "2025" },
      { id: "income-prices", title: "Εισόδημα, πληθωρισμός & πραγματική δαπάνη", description: "Κοινή βάση 2019=100, πραγματικές αξίες και διερεύνηση σχέσεων· όχι απόδειξη αιτιότητας.", period: "2019–2025" }
    ]
  },
  {
    id: "retail",
    title: "Πωλήσεις & επιδόσεις λιανεμπορίου",
    introduction: "Κύκλος εργασιών, όγκος, κλάδοι και προσδοκίες σε αντίστοιχες περιόδους.",
    presets: [
      { id: "retail-annual", indicator: "retail-annual-2024-2025", title: "Τζίρος έναντι όγκου πωλήσεων", description: "Διαφορετικοί δείκτες με κοινή βάση, όχι ισοδύναμα μεγέθη.", period: "2024–2025" },
      { id: "retail-monthly-indices", indicator: "retail-2026-monthly-indices", title: "Πορεία των λιανικών πωλήσεων μέσα στο 2026", description: "Μηνιαία εξέλιξη επίσημων δεικτών, μόνο για τους μήνες που έχουν δημοσιευθεί.", period: "Ιαν–Ιουλ 2026" },
      { id: "retail-sectors", indicator: "retail-sectors-2026", title: "Τρόφιμα έναντι λοιπών αγαθών", description: "Παράλληλη κλαδική εξέλιξη με βάση το 2021=100.", period: "Ιαν–Ιουλ 2026" },
      { id: "retail-june", indicator: "retail-june-growth", title: "Ιούνιος 2025 απέναντι στον Ιούνιο 2026", description: "Σύγκριση δημοσιευμένων ετήσιων ρυθμών με προσοχή στις αναθεωρήσεις.", period: "2025–2026" },
      { id: "retail-september", indicator: "retail-september", title: "Λιανικές προσδοκίες κάθε Σεπτέμβριο", description: "Ίδιος εθνικός δείκτης ΙΟΒΕ σε τέσσερις αντίστοιχες περιόδους.", period: "2023–2026" },
      { id: "retail-expectations-overlay", indicator: "retail-monthly", title: "Προσδοκίες λιανεμπορίου: 2025 vs 2026", description: "Επικάλυψη ίδιων μηνών· το 2026 περιλαμβάνει μόνο δημοσιευμένες τιμές.", period: "2025–2026" }
    ]
  },
  {
    id: "prices-sentiment",
    title: "Τιμές & οικονομικό κλίμα",
    introduction: "Διαχρονικές μεταβολές τιμών, επιχειρηματικές προσδοκίες και εμπιστοσύνη σε Ελλάδα και Ευρώπη.",
    presets: [
      { id: "supermarket-prices", indicator: "supermarket-prices", title: "Πώς άλλαξε ο ρυθμός τιμών στα σούπερ μάρκετ;", description: "Ετήσιοι ρυθμοί μεταβολής τιμών, όχι επίπεδα τιμών· οι διαφορές μετρώνται σε μονάδες.", period: "Σεπ 2025–2026" },
      { id: "hicp-price-level", indicator: "hicp-annual-index", title: "Πόσο ανέβηκε σωρευτικά το επίπεδο τιμών;", description: "ΕνΔΤΚ Ελλάδας ως επίπεδο δείκτη (βάση 2015=100), όχι ετήσιο ποσοστό.", period: "2019–2025" },
      { id: "hicp-inflation", indicator: "hicp-annual-inflation", title: "Πώς κινήθηκε ο ετήσιος μέσος πληθωρισμός;", description: "Ποσοστιαία μεταβολή ΕνΔΤΚ, ξεχωριστά από το επίπεδο τιμών.", period: "2020–2025" },
      { id: "cpi-needs", indicator: "greek-cpi-2025-categories", title: "Τι ακρίβυνε περισσότερο ανά βασική ανάγκη;", description: "Ετήσιες μεταβολές εθνικού ΔΤΚ ανά κατηγορία το 2025, χωρίς πρόσθεση ποσοστών.", period: "2025" },
      { id: "economic-sentiment", indicator: "annual-esi", title: "Οικονομικό κλίμα: Ελλάδα, ΕΕ & Ευρωζώνη", description: "Ετήσιες σειρές από εναρμονισμένη πηγή, όχι στοιχεία ετήσιου τζίρου.", period: "2022–2025" },
      { id: "economic-sentiment-monthly", indicator: "monthly-esi", title: "Οικονομικό κλίμα ανά μήνα: 2025 vs 2026", description: "Μηνιαίες επικαλύψεις ανά περιοχή, χωρίς τεχνητή συμπλήρωση μη διαθέσιμων μηνών.", period: "2025–2026" },
      { id: "sector-expectations", indicator: "annual-balances", title: "Καταναλωτές, εμπόριο & υπηρεσίες", description: "Ισοζύγια διαφορετικών κλάδων για σύγκριση πορείας, όχι απόλυτου επιπέδου.", period: "2022–2024" }
    ]
  },
  {
    id: "surveys",
    title: "Τι δηλώνουν επιχειρήσεις & καταναλωτές",
    introduction: "Δημοσιευμένα ευρήματα δειγματοληπτικών ερευνών· περιγραφικές αναλογίες και όχι χρονοσειρές.",
    presets: [
      { id: "summer-discounts", indicator: "esee-summer-2025-survey", title: "Πώς πήγαν οι θερινές εκπτώσεις;", description: "Απαντήσεις εμπόρων για πωλήσεις, επισκεψιμότητα και ικανοποίηση.", period: "2025" },
      { id: "consumer-choice", indicator: "ielka-food-choice-2025", title: "Τι μετρά περισσότερο στις αγορές τροφίμων;", description: "Δαπάνη και ποιότητα ως κριτήρια επιλογής, στην ίδια έρευνα.", period: "2025" },
      { id: "promotion-behaviour", indicator: "ielka-offers-2025", title: "Πόσο σημαντικές είναι οι προσφορές;", description: "Δηλώσεις καταναλωτών για προσφορές και αγοραστική συμπεριφορά.", period: "2025" },
      { id: "holiday-trade", indicator: "holiday-survey", title: "Τι ανέφεραν τα καταστήματα για τις γιορτές;", description: "Κατηγορίες απαντήσεων της ίδιας έρευνας, όχι μεταβολή σε εθνικό τζίρο.", period: "Εορτές 2025–2026" }
    ]
  }
];

export const RESEARCH_PRESET_COUNT = RESEARCH_PRESET_CATEGORIES.reduce(
  (count, category) => count + category.presets.length, 0
);
